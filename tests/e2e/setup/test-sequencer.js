class E2ETestSequencer {
  sort(tests) {
    // Sort tests to run basic connection tests first
    const orderedTests = tests.sort((testA, testB) => {
      const orderMap = {
        'basic-connection.test.js': 1,
        'page-inspection.test.js': 2,
        'basic-wizard.test.js': 3,
        'wizard-workflow-simple.test.js': 4,
        'wizard-workflow.test.js': 5,
        'accessibility.test.js': 6
      };
      
      const getOrder = (test) => {
        const filename = test.path.split(/[/\\]/).pop();
        return orderMap[filename] || 999;
      };
      
      return getOrder(testA) - getOrder(testB);
    });

    return orderedTests;
  }
}

module.exports = E2ETestSequencer;