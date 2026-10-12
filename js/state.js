export const state = {
  allFetchedTasks: [],
  backlogTasks: [],
  currentFilteredTasks: [],
  currentTab: 'TODAY',
  projectTeamsMap: {},
  currentPage: 1,
  rowsPerPage: 30,
  abortController: null,   // for cancelling stale fetches
};

export function setAbortController() {
  if (state.abortController) state.abortController.abort();
  state.abortController = new AbortController();
  return state.abortController;
}