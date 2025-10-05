import { Component } from '../base/component.js';
import { AppHeader } from './app-header.js';
import { WizardSidebar } from './wizard-sidebar.js';

/**
 * Main Layout Component
 * Manages the overall application layout with header, sidebar, and main content
 */
export class MainLayout extends Component {
    constructor() {
        super();
        this.header = null;
        this.sidebar = null;
        this.mainContent = null;
        this.element = this.createElement();
        this.init();
    }

    /**
     * Create the main layout element
     * @returns {HTMLElement} - Layout element
     */
    createElement() {
        const template = `
            <div class="app-container">
                <!-- Header will be inserted here -->
                <div class="wizard-container">
                    <!-- Sidebar will be inserted here -->
                    <main class="main-content">
                        <!-- Page content will be inserted here -->
                    </main>
                </div>
            </div>
        `;
        return this.createFromTemplate(template);
    }

    /**
     * Initialize layout components
     */
    onInit() {
        this.createHeader();
        this.createSidebar();
        this.mainContent = this.find('.main-content');
    }

    /**
     * Create and setup header component
     */
    createHeader() {
        this.header = new AppHeader();
        this.addChild('header', this.header);
        
        // Insert header at the beginning of app container
        this.element.insertBefore(this.header.element, this.element.firstChild);
    }

    /**
     * Create and setup sidebar component
     */
    createSidebar() {
        this.sidebar = new WizardSidebar();
        this.addChild('sidebar', this.sidebar);
        
        // Insert sidebar into wizard container
        const wizardContainer = this.find('.wizard-container');
        wizardContainer.insertBefore(this.sidebar.element, wizardContainer.firstChild);
        
        // Listen for step changes
        this.addEventListener(this.sidebar.element, 'step-change', (e) => {
            this.emit('step-change', e.detail);
        });
    }

    /**
     * Set the main content
     * @param {HTMLElement|Component} content - Content to display
     */
    setMainContent(content) {
        if (!this.mainContent) return;
        
        // Clear existing content
        this.mainContent.innerHTML = '';
        
        // Add new content
        if (content instanceof Component) {
            this.mainContent.appendChild(content.element);
        } else if (content instanceof HTMLElement) {
            this.mainContent.appendChild(content);
        }
    }

    /**
     * Get header component
     * @returns {AppHeader} - Header component
     */
    getHeader() {
        return this.header;
    }

    /**
     * Get sidebar component
     * @returns {WizardSidebar} - Sidebar component
     */
    getSidebar() {
        return this.sidebar;
    }

    /**
     * Get main content element
     * @returns {HTMLElement} - Main content element
     */
    getMainContent() {
        return this.mainContent;
    }

    /**
     * Update step in sidebar
     * @param {string} stepId - Step ID
     * @param {string} status - Step status
     */
    updateStep(stepId, status) {
        if (this.sidebar) {
            this.sidebar.updateStepStatus(stepId, status);
        }
    }

    /**
     * Set current step
     * @param {string} stepId - Step ID
     */
    setCurrentStep(stepId) {
        if (this.sidebar) {
            this.sidebar.setCurrentStep(stepId);
        }
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.addClass('loading');
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        this.removeClass('loading');
    }

    /**
     * Render the component
     */
    render() {
        // Layout is mostly static, child components handle their own rendering
    }
}