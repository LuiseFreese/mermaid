module.exports = async function globalTeardown() {
  console.log('🧹 Cleaning up E2E test environment...');
  
  // Close browser
  if (global.__BROWSER__) {
    await global.__BROWSER__.close();
    console.log('✅ Browser closed');
  }

  // Kill server processes
  if (global.__SERVER_PROCESS__) {
    global.__SERVER_PROCESS__.kill();
    console.log('✅ Backend server stopped');
  }

  if (global.__FRONTEND_PROCESS__) {
    global.__FRONTEND_PROCESS__.kill();
    console.log('✅ Frontend dev server stopped');
  }

  console.log('🎯 E2E test environment cleaned up');
};
