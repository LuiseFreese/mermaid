/**
 * Main Wizard Application
 * Entry point for the component-based wizard application
 */

import { MainLayout } from './components/layout/main-layout.js';
import { WizardState } from './assets/js/wizard-state.js';
import { ApiClient } from './assets/js/api-client.js';

/**
 * Wizard Application Class
 * Manages the overall application flow and component coordination
 */
class WizardApp {
    constructor() {
        this.layout = null;
        this.state = new WizardState();
        this.api = new ApiClient();
        this.currentPageComponent = null;
        this.pages = new Map();
        this.initialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        if (this.initialized) return;

        try {
            this.showLoading();
            
            // Create main layout
            this.layout = new MainLayout();
            
            // Mount to DOM
            const appRoot = document.getElementById('app-root');
            if (appRoot) {
                appRoot.appendChild(this.layout.element);
            }

            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize first page
            await this.showPage('validation');
            
            this.initialized = true;
            this.hideLoading();
            
            console.log('Wizard application initialized successfully');
        } catch (error) {
            console.error('Failed to initialize wizard application:', error);
            this.showError('Failed to initialize application. Please refresh the page.');
        }
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Listen for step changes from sidebar
        this.layout.element.addEventListener('step-change', (e) => {
            const { stepId } = e.detail;
            this.navigateToStep(stepId);
        });

        // Listen for state changes
        this.state.on('step-changed', ({ currentStep }) => {
            this.layout.setCurrentStep(currentStep);
            this.showPage(currentStep);
        });

        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.step) {
                this.navigateToStep(e.state.step, false);
            }
        });

        // Handle unload to save state
        window.addEventListener('beforeunload', () => {
            this.saveState();
        });
    }

    /**
     * Navigate to a specific step
     * @param {string} stepId - Step to navigate to
     * @param {boolean} updateHistory - Whether to update browser history
     */
    async navigateToStep(stepId, updateHistory = true) {
        if (!this.state.canProceedToStep(stepId)) {
            this.showError(`Cannot proceed to ${stepId}. Please complete the current step first.`);
            return;
        }

        try {
            // Update state
            this.state.setCurrentStep(stepId);
            
            // Update browser history
            if (updateHistory) {
                history.pushState({ step: stepId }, '', `#${stepId}`);
            }
            
            // Show the page
            await this.showPage(stepId);
            
        } catch (error) {
            console.error(`Failed to navigate to step ${stepId}:`, error);
            this.showError(`Failed to load ${stepId} page.`);
        }
    }

    /**
     * Show a specific page
     * @param {string} pageId - Page to show
     */
    async showPage(pageId) {
        try {
            // Hide current page
            if (this.currentPageComponent) {
                this.currentPageComponent.hide();
            }

            // Load page component if not already loaded
            if (!this.pages.has(pageId)) {
                const pageComponent = await this.loadPageComponent(pageId);
                this.pages.set(pageId, pageComponent);
            }

            // Show new page
            this.currentPageComponent = this.pages.get(pageId);
            
            if (this.currentPageComponent) {
                this.layout.setMainContent(this.currentPageComponent);
                this.currentPageComponent.show();
            }

        } catch (error) {
            console.error(`Failed to show page ${pageId}:`, error);
            this.showError(`Failed to load page: ${pageId}`);
        }
    }

    /**
     * Dynamically load page component
     * @param {string} pageId - Page ID
     * @returns {Promise<Component>} - Page component
     */
    async loadPageComponent(pageId) {
        try {
            switch (pageId) {
                case 'validation': {
                    const { ValidationPage } = await import('./components/wizard/validation-page.js');
                    return new ValidationPage(this.state, this.api);
                }
                
                case 'publisher':
                case 'solution': {
                    const { SolutionPage } = await import('./components/wizard/solution-page.js');
                    return new SolutionPage(this.state, this.api);
                }
                
                case 'choices': {
                    const { ChoicesPage } = await import('./components/wizard/choices-page.js');
                    return new ChoicesPage(this.state, this.api);
                }
                
                case 'summary':
                case 'review': {
                    const { ReviewPage } = await import('./components/wizard/review-page.js');
                    return new ReviewPage(this.state, this.api);
                }
                
                default:
                    throw new Error(`Unknown page: ${pageId}`);
            }
        } catch (error) {
            console.error(`Failed to load page component ${pageId}:`, error);
            
            // Return fallback component
            const { Component } = await import('./components/base/component.js');
            const fallback = new Component();
            fallback.element = document.createElement('div');
            fallback.element.innerHTML = `
                <div class="message-card error">
                    <i class="fas fa-exclamation-triangle message-icon"></i>
                    <div class="message-content">
                        <div class="message-title">Failed to load page</div>
                        <div class="message-description">The ${pageId} page could not be loaded. Please refresh and try again.</div>
                    </div>
                </div>
            `;
            return fallback;
        }
    }

    /**
     * Show loading overlay
     */
    showLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        // For now, use alert. In the future, implement a proper modal or toast
        alert(message);
    }

    /**
     * Save current state to localStorage
     */
    saveState() {
        try {
            const stateData = this.state.toJSON();
            localStorage.setItem('wizard-state', JSON.stringify(stateData));
        } catch (error) {
            console.error('Failed to save state:', error);
        }
    }

    /**
     * Load state from localStorage
     */
    loadState() {
        try {
            const savedState = localStorage.getItem('wizard-state');
            if (savedState) {
                const stateData = JSON.parse(savedState);
                this.state.fromJSON(stateData);
                return true;
            }
        } catch (error) {
            console.error('Failed to load saved state:', error);
        }
        return false;
    }

    /**
     * Reset the wizard to initial state
     */
    reset() {
        this.state.reset();
        this.pages.clear();
        this.currentPageComponent = null;
        localStorage.removeItem('wizard-state');
        this.navigateToStep('validation');
    }

    /**
     * Get current application state
     * @returns {Object} - Application state
     */
    getState() {
        return {
            wizard: this.state.toJSON(),
            currentPage: this.currentPageComponent ? this.currentPageComponent.constructor.name : null,
            initialized: this.initialized
        };
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Create global wizard app instance
        window.wizardApp = new WizardApp();
        
        // Try to load saved state
        window.wizardApp.loadState();
        
        // Initialize the application
        await window.wizardApp.init();
        
        // Handle initial URL hash
        const hash = window.location.hash.slice(1);
        if (hash && ['validation', 'publisher', 'solution', 'choices', 'summary', 'review'].includes(hash)) {
            await window.wizardApp.navigateToStep(hash, false);
        }
        
    } catch (error) {
        console.error('Failed to start wizard application:', error);
        
        // Show fallback error page
        document.getElementById('app-root').innerHTML = `
            <div style="padding: 40px; text-align: center; font-family: 'Segoe UI', sans-serif;">
                <h1 style="color: #d13438;">Application Error</h1>
                <p>The wizard application failed to start. Please refresh the page and try again.</p>
                <p style="color: #666; font-size: 14px;">Error: ${error.message}</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Refresh Page
                </button>
            </div>
        `;
    }
});
