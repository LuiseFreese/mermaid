/**
 * Module Loader Utility - Handles loading wizard modules in correct order
 * Ensures all dependencies are available before initialization
 */
class ModuleLoader {
    constructor() {
        this.loadedModules = new Set();
        this.loadQueue = [];
    }

    /**
     * Load a script dynamically
     * @param {string} src - Script source path
     * @returns {Promise} Promise that resolves when script is loaded
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (this.loadedModules.has(src)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                this.loadedModules.add(src);
                resolve();
            };
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }

    /**
     * Load wizard modules in correct dependency order
     * @returns {Promise} Promise that resolves when all modules are loaded
     */
    async loadWizardModules() {
        const modules = [
            // Load services first
            'src/wizard/services/state.js',
            'src/wizard/services/api.js',
            
            // Then components
            'src/wizard/components/ui-manager.js',
            
            // Finally the main controller
            'src/wizard/controller.js'
        ];

        for (const module of modules) {
            await this.loadScript(module);
        }

        console.log('All wizard modules loaded successfully');
    }
}

// Create global module loader
window.moduleLoader = new ModuleLoader();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ModuleLoader };
}
