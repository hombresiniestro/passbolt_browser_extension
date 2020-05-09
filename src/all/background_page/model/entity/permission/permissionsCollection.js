/**
 * Passbolt ~ Open source password manager for teams
 * Copyright (c) Passbolt SA (https://www.passbolt.com)
 *
 * Licensed under GNU Affero General Public License version 3 of the or any later version.
 * For full copyright and license information, please see the LICENSE.txt
 * Redistributions of files must retain the above copyright notice.
 *
 * @copyright     Copyright (c) Passbolt SA (https://www.passbolt.com)
 * @license       https://opensource.org/licenses/AGPL-3.0 AGPL License
 * @link          https://www.passbolt.com Passbolt(tm)
 * @since         2.13.0
 */
const {EntitySchema} = require('../abstract/entitySchema');
const {EntityValidationError} = require('../abstract/entityValidationError');
const {EntityCollection} = require('../abstract/entityCollection');
const {EntityCollectionError} = require('../abstract/entityCollectionError');
const {PermissionEntity} = require('./permissionEntity');

const ENTITY_NAME = 'Permissions';

const RULE_UNIQUE_ID = 'unique_id';
const RULE_UNIQUE_ARO = 'unique_aro';
const RULE_SAME_ACO = 'same_aco';
const RULE_ONE_OWNER = 'owner';

class PermissionsCollection extends EntityCollection {
  /**
   * Permissions Collection constructor
   * Some validation rules are to be expected:
   * - All items should be a valid PermissionEntity
   * - All items should be about the same folder or resource
   * - There can be only one permission per user or group
   *
   * Optional validation
   * - There should be at least one owner
   *
   * @param {array} permissionsDto
   * @param {boolean} [ownerValidation] true by default
   * @throws EntityValidationError if the dto cannot be converted into an entity
   */
  constructor(permissionsDto, ownerValidation) {
    super(EntitySchema.validate(
      PermissionsCollection.ENTITY_NAME,
      permissionsDto,
      PermissionsCollection.getSchema()
    ));

    // Note: there is no "multi-item" validation
    // Collection validation will fail at the first item that doesn't validate
    this._props.forEach(permission => {
      this.push(permission);
    });

    // Logical validation rules
    // A permission list must contain at least one owner
    if (typeof ownerValidation === 'undefined' || ownerValidation) {
      this.assertAtLeastOneOwner();
    }

    // We do not keep original props
    this._props = null;
  }

  // ==================================================
  // Serialization
  // ==================================================
  /**
   * Return a DTO ready to be sent to API
   *
   * @param {object} [contain] optional
   * @returns {object}
   */
  toDto(contain) {
    const result = [];
    for(let permission of this) {
      result.push(permission.toDto(contain))
    }
    return result;
  }

  /**
   * Customizes JSON stringification behavior
   * @returns {*}
   */
  toJSON() {
    return this.toDto(PermissionEntity.ALL_CONTAIN_OPTIONS);
  }

  // ==================================================
  // Dynamic getters
  // ==================================================
  /**
   * Get permissions entity schema
   *
   * @returns {Object} schema
   */
  static getSchema() {
    return {
      "type": "array",
      "items": PermissionEntity.getSchema(),
    }
  }

  /**
   * Get permissions
   * @returns {Array<PermissionEntity>} permissions
   */
  get permissions() {
    return this._items;
  }

  // ==================================================
  // Finders
  // ==================================================
  /**
   * Return true if a given permission can be found already in the collection
   * Look by Aco and Aro
   *
   * @param {PermissionEntity} permission
   * @returns {PermissionEntity} if a match is found in collection
   */
  findByAro(permission) {
    const result = this._items.filter(existingPermission => PermissionEntity.isAroMatching(existingPermission, permission));
    if (result.length) {
      return result[0];
    }
    return undefined;
  }

  // ==================================================
  // Push items in the collection
  // ==================================================
  /**
   * Push a copy of the permission to the list
   * @param {PermissionEntity} permission DTO or PermissionEntity
   * @throws {EntityValidationError} if a permission already exist or is not valid
   */
  push(permission) {
    if (!permission || typeof permission !== 'object') {
      throw new TypeError(`PermissionsCollection push expect a permission DTO.`);
    }
    if (permission instanceof PermissionEntity) {
      permission = permission.toDto(PermissionEntity.ALL_CONTAIN_OPTIONS); // deep clone
    }

    let newPermission = new PermissionEntity(permission); // validate

    // Build rules
    // Assert there is not already a permission with the same id
    // Assert there is not already a permission with the same ACO/ARO
    // Assert we're dealing with same resource / folder
    this.assertSameAco(newPermission);
    this.assertUniqueId(newPermission);
    this.assertUniqueAro(newPermission);

    super.push(newPermission);
  }

  /**
   * Add or replace an already existing permission if type is higher
   *
   * @param {PermissionEntity} permission
   * @throws {EntityCollectionError} if the permission cannot be pushed or replaced
   */
  addOrReplace(permission) {
    try {
      this.push(permission);
    } catch(error) {
      const recover = [PermissionsCollection.RULE_UNIQUE_ID, PermissionsCollection.RULE_UNIQUE_ARO]
      if (!recover.includes(error.rule)) {
        throw error;
      }
      let existingPermission = this.permissions[error.position];
      if (PermissionEntity.isAcoAndAroMatching(existingPermission, permission)) {
        // if the match, keep the one with highest permission
        this.permissions[error.position] = PermissionEntity.getHighestPermission(existingPermission, permission);
      } else {
        // same id but different aro and aco, it smells...
        throw error;
      }
    }
  }

  // ==================================================
  // Permissions assertions
  // ==================================================
  /**
   * Assert there the collection is always about the same ACO (resource/folder)
   *
   * @param {PermissionEntity} permission
   * @throws {EntityValidationError} if a permission for another ACO already exist
   */
  assertSameAco(permission) {
    if (!this.permissions.length) {
      return;
    }
    if (!PermissionEntity.isAcoMatching(permission, this.permissions[0])) {
      const msg = `The collection is already composed of this type of ACO: ${this.permissions[0].aco}.`;
      throw new EntityCollectionError(0, PermissionsCollection.RULE_SAME_ACO, msg);
    }
  }

  /**
   * Assert there is no other permission with the same id in the collection
   *
   * @param {PermissionEntity} permission
   * @throws {EntityValidationError} if a permission with the same id already exist
   */
  assertUniqueId(permission) {
    if (!permission.id) {
      return;
    }
    const length = this.permissions.length;
    let i = 0;
    for(; i < length; i++) {
      let existingPermission = this.permissions[i];
      if (existingPermission.id && existingPermission.id === permission.id) {
        throw new EntityCollectionError(i, PermissionsCollection.RULE_UNIQUE_ID, `Permission id ${permission.id} already exists.`);
      }
    }
  }

  /**
   * Assert that there is no other permission for the same ARO (User or Group)
   *
   * @param {PermissionEntity} permission
   * @throws {EntityValidationError} if a permission with the same aco id already exist
   */
  assertUniqueAro(permission) {
    const length = this.permissions.length;
    let i = 0;
    for(; i < length; i++) {
      let existingPermission = this.permissions[i];
      if (PermissionEntity.isAroMatching(permission, existingPermission)) {
        const msg = `${permission.aro} id ${permission.aroForeignKey} already exists in the permission list.`;
        throw new EntityCollectionError(i, PermissionsCollection.RULE_UNIQUE_ARO, msg);
      }
    }
  }

  /**
   * Assert the collection contain at least one owner
   *
   * @return {void}
   * @throws {EntityValidationError} if not owner is found in the collection
   */
  assertAtLeastOneOwner() {
    for (let permission of this) {
      if (permission.isOwner()) {
        return;
      }
    }
    const msg = 'Permission collection should contain at least one owner.'
    throw new EntityCollectionError(0, PermissionsCollection.RULE_ONE_OWNER, msg);
  }

  /**
   * Assert a given parameter is an instance of a PermissionCollection
   *
   * @param {PermissionsCollection} collection
   * @throw {TypeError} if parameter is not an instance of PermissionCollection
   */
  static assertIsPermissionsCollection(collection) {
    if (!(collection instanceof PermissionsCollection)) {
      throw new TypeError('Failed to assert the parameter is a valid collection of permissions');
    }
  }

  // ==================================================
  // Permissions "arithmetics"
  // ==================================================
  /**
   * Create a new set based on set1 ∪ set2
   *
   * @param {PermissionsCollection} set1
   * @param {PermissionsCollection} set2
   * @param {boolean} [ownerValidation] optional default true
   * @return {PermissionsCollection} set3
   */
  static unionByAcoAndType(set1, set2, ownerValidation) {
    const set3 = new PermissionsCollection(set1.toDto(), false);
    for (let set2Permission of set2) {
      set3.addOrReplace(set2Permission);
    }
    if (typeof ownerValidation === 'undefined' || ownerValidation) {
      set3.assertAtLeastOneOwner();
    }
    return set3;
  }

  // ==================================================
  // Static getters
  // ==================================================
  /**
   * PermissionsCollection.ENTITY_NAME
   * @returns {string}
   */
  static get ENTITY_NAME() {
    return ENTITY_NAME;
  }

  /**
   * PermissionsCollection.RULE_UNIQUE_ID
   * @returns {string}
   */
  static get RULE_UNIQUE_ID() {
    return RULE_UNIQUE_ID;
  }

  /**
   * PermissionsCollection.PERMISSION_COLLECTION_RULE_UNIQUE_ARO
   * @returns {string}
   */
  static get RULE_UNIQUE_ARO() {
    return RULE_UNIQUE_ARO;
  }

  /**
   * PermissionsCollection.RULE_SAME_ACO
   * @returns {string}
   */
  static get RULE_SAME_ACO() {
    return RULE_SAME_ACO;
  }

  /**
   * PermissionsCollection.RULE_ONE_OWNER
   * @returns {string}
   */
  static get RULE_ONE_OWNER() {
    return RULE_ONE_OWNER;
  }
}

exports.PermissionsCollection = PermissionsCollection;
