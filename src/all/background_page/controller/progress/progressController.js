/**
 * Progress dialog controller.
 *
 * @copyright (c) 2019 Passbolt SA
 * @licence GNU Affero General Public License http://www.gnu.org/licenses/agpl-3.0.en.html
 */

const Worker = require('../../model/worker');

/**
 * Start a progression.
 *
 * @param {Worker} worker The worker from which the request comes from.
 * @param {string} title The progress title.
 * @param {integer} goals The number of goals to achieve.
 * @return {Promise}
 */
const start = function (worker, title, goals, message) {
  // If the source of the request is a legacy worker then display the react app that will be in charge of
  // treating the progress events.
  if (isLegacyWorker(worker)) {
    const appWorker = Worker.get('App', worker.tab.id);
    appWorker.port.emit('passbolt.app.show');
  }
  const progressWorker = getProgressWorker(worker);
  progressWorker.port.emit('passbolt.progress.start', title, goals, message)
};
exports.start = start;

/**
 * Complete a progression.
 *
 * @param {Worker} worker The worker from which the request comes from.
 */
const complete = function (worker) {
  const progressWorker = getProgressWorker(worker);
  progressWorker.port.emit('passbolt.progress.complete');
  // If the source of the request is a legacy worker then hide the react app.
  if (isLegacyWorker(worker)) {
    const appWorker = Worker.get('App', worker.tab.id);
    appWorker.port.emit('passbolt.app.hide');
  }
};
exports.complete = complete;

/**
 * Update the progress dialog.
 *
 * @param {Worker} worker The worker from which the request comes from.
 * @param completed Number of steps completed
 * @param message (optional) The message to display
 */
const update = function (worker, completed, message) {
  const progressWorker = getProgressWorker(worker);
  progressWorker.port.emit('passbolt.progress.update', message, completed);
};
exports.update = update;

/**
 * Update the goals of the progress dialog.
 *
 * @param {Worker} worker The worker from which the request comes from.
 * @param goals The new goals
 */
const updateGoals = function (worker, goals) {
  const progressWorker = getProgressWorker(worker);
  progressWorker.port.emit('passbolt.progress.update-goals', goals);
};
exports.updateGoals = updateGoals;

/**
 * The progress dialog is now managed by the new react application.
 * The treatment of the requests coming from any legacy worker (Import, Export) should be delegated to the new
 * react application.
 * @param {Worker} srcWorker The source worker.
 * @return {Worker}
 */
const getProgressWorker = function (srcWorker) {
  if (isLegacyWorker(srcWorker)) {
    return Worker.get('ReactApp', srcWorker.tab.id);
  }

  return srcWorker;
};

/**
 * A worker is considered legacy if a pageMod is associated to it.
 * We considered them as legacy because they are going to be migrated soon to the new react application.
 *
 * @param worker
 * @returns {boolean}
 */
const isLegacyWorker = function (worker) {
  // If a pageMod is associated to the source worker, then the worker is a legacy worker (App, Import, Export ...).
  return worker.pageMod !== undefined;
};
