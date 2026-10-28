/** The questionnaire's charts, as one chunk loaded with the first screen that draws one. */
export const loadCharts = () => import('./charts');

/** For the report: the charts loaded before it prints. */
export const chartsReady = () => loadCharts().then(() => undefined);
