# Wizard Modularization Integration Guide

## 🎯 Overview

This guide explains how to integrate the newly modularized wizard components into the existing `wizard-ui.html` file while maintaining 100% backward compatibility.

## 📁 New File Structure

```
src/wizard/
├── components/
│   └── ui-manager.js          # UI component management
├── services/
│   ├── api.js                 # Backend API communication
│   └── state.js               # Centralized state management
├── utils/
│   └── module-loader.js       # Dynamic module loading
└── controller.js              # Main wizard orchestrator
```

## 🔗 Integration Steps

### 1. Add Module Script Tags to wizard-ui.html

Add these script tags **before** the existing inline JavaScript in `wizard-ui.html`:

```html
<!-- Wizard Module Dependencies -->
<script src="src/wizard/utils/module-loader.js"></script>
<script src="src/wizard/services/state.js"></script>
<script src="src/wizard/services/api.js"></script>
<script src="src/wizard/components/ui-manager.js"></script>
<script src="src/wizard/controller.js"></script>

<!-- Initialize modules after DOM loads -->
<script>
document.addEventListener('DOMContentLoaded', async () => {
    // Option 1: Use module loader for dynamic loading
    try {
        await window.moduleLoader.loadWizardModules();
        console.log('Wizard modules loaded successfully');
    } catch (error) {
        console.error('Failed to load wizard modules:', error);
    }
    
    // Option 2: Direct initialization (if scripts are already loaded)
    // window.wizardController = new WizardController();
});
</script>
```

### 2. Update Existing Event Handlers (Optional)

The new modular architecture provides these global objects:

- `window.wizardController` - Main controller with all methods
- `window.stateService` - Direct state access (via controller)
- `window.apiService` - Direct API access (via controller)

#### Example: Replace existing validation function

**Old code in wizard-ui.html:**
```javascript
async function validateERD() {
    // ... existing validation logic
}
```

**New code (can coexist):**
```javascript
async function validateERD() {
    // Use new modular approach if available
    if (window.wizardController) {
        const content = window.wizardController.stateService.get('currentERDContent');
        return await window.wizardController.apiService.validateERD(content);
    }
    
    // Fallback to existing logic
    // ... existing validation logic
}
```

## 🔄 Migration Strategy

### Phase 1: Coexistence (Immediate)
- Add new modules alongside existing code
- No changes to existing functionality
- Test that both systems work independently

### Phase 2: Gradual Migration (Next PR)
- Replace existing event handlers one by one
- Use new state management for new features
- Remove old code incrementally

### Phase 3: Full Migration (Future PR)
- Remove all legacy inline JavaScript
- Pure modular architecture
- Add comprehensive tests

## 🧪 Testing Approach

### 1. Backward Compatibility Test
```javascript
// Test that existing functions still work
const existingFunctions = [
    'validateERD',
    'handleFileUpload', 
    'showStep',
    'deployToDataverse'
];

existingFunctions.forEach(funcName => {
    if (typeof window[funcName] === 'function') {
        console.log(`✅ ${funcName} still available`);
    } else {
        console.warn(`⚠️ ${funcName} not found`);
    }
});
```

### 2. New Module Test
```javascript
// Test that new modules are properly loaded
const expectedModules = [
    'StateService',
    'APIService', 
    'UIComponentManager',
    'WizardController'
];

expectedModules.forEach(moduleName => {
    if (typeof window[moduleName] !== 'undefined') {
        console.log(`✅ ${moduleName} loaded`);
    } else {
        console.warn(`⚠️ ${moduleName} not loaded`);
    }
});

// Test controller initialization
if (window.wizardController) {
    console.log('✅ Wizard controller initialized');
    console.log('State:', window.wizardController.getState());
} else {
    console.warn('⚠️ Wizard controller not initialized');
}
```

## 🔧 Configuration Options

### Option 1: Hybrid Mode (Recommended for PR 1)
```html
<script>
// Use new modules if available, fallback to legacy
const useModularWizard = typeof WizardController !== 'undefined';

if (useModularWizard) {
    console.log('Using modular wizard architecture');
    // New logic here
} else {
    console.log('Using legacy wizard architecture');
    // Existing logic here
}
</script>
```

### Option 2: Feature Flags
```html
<script>
const FEATURES = {
    modularState: true,
    modularAPI: true,
    modularUI: false // Gradual rollout
};

if (FEATURES.modularState && window.wizardController) {
    // Use new state management
} else {
    // Use existing state
}
</script>
```

## 🐛 Error Handling

### Module Loading Errors
```javascript
window.addEventListener('error', (event) => {
    if (event.filename && event.filename.includes('wizard/')) {
        console.error('Wizard module error:', event.error);
        // Fallback to legacy mode
        window.useModularWizard = false;
    }
});
```

### Dependency Checks
```javascript
function checkWizardDependencies() {
    const required = ['StateService', 'APIService', 'UIComponentManager'];
    const missing = required.filter(dep => typeof window[dep] === 'undefined');
    
    if (missing.length > 0) {
        console.warn('Missing wizard dependencies:', missing);
        return false;
    }
    
    return true;
}
```

## 📊 Benefits of This Approach

### 1. Zero Risk Migration
- Existing functionality remains untouched
- New features can use modular architecture
- Gradual migration path

### 2. Improved Maintainability
- **Single Responsibility**: Each module has one clear purpose
- **Dependency Injection**: Services can be easily mocked/tested
- **State Centralization**: All state changes go through StateService

### 3. Better Testing
- **Unit Tests**: Each service can be tested independently
- **Integration Tests**: Controller orchestration can be tested
- **UI Tests**: Component interactions can be isolated

### 4. Developer Experience
- **IntelliSense**: Better IDE support with modular classes
- **Debugging**: Clear separation of concerns
- **Documentation**: Each module is self-documenting

## 🚀 Next Steps

1. **Immediate**: Add script tags to `wizard-ui.html`
2. **Test**: Verify both old and new systems work
3. **Validate**: Run existing tests to ensure no regressions
4. **Document**: Update any existing documentation
5. **Plan**: Prepare for Phase 2 migration in next PR

## 📞 Support

If you encounter any issues during integration:

1. Check browser console for module loading errors
2. Verify script tag order (dependencies first)
3. Test with `window.wizardController.debug()` for state inspection
4. Use `checkWizardDependencies()` to verify module loading

## 🎉 Success Metrics

- ✅ No existing functionality broken
- ✅ New modules load without errors
- ✅ State management works correctly
- ✅ API calls succeed through new service
- ✅ UI updates properly through new components
- ✅ Controller orchestrates everything smoothly
