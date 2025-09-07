import { Component } from '../base/component.js';

/**
 * Wizard Sidebar Component
 * Displays the step navigation for the wizard
 */
export class WizardSidebar extends Component {
    constructor(steps = [], currentStep = 'validation') {
        super();
        this.steps = steps;
        this.currentStep = currentStep;
        this.element = this.createElement();
        this.init();
    }

    /**
     * Create the sidebar element
     * @returns {HTMLElement} - Sidebar element
     */
    createElement() {
        const template = `
            <nav class="sidebar">
                <ul class="step-nav">
                    ${this.renderSteps()}
                </ul>
            </nav>
        `;
        return this.createFromTemplate(template);
    }

    /**
     * Render navigation steps
     * @returns {string} - Steps HTML
     */
    renderSteps() {
        if (!this.steps.length) {
            // Default steps if none provided
            this.steps = [
                { id: 'validation', number: 1, title: 'ERD Validation', status: 'active' },
                { id: 'solution', number: 2, title: 'Solution & Publisher', status: 'pending' },
                { id: 'choices', number: 3, title: 'Global Choices', status: 'pending' },
                { id: 'review', number: 4, title: 'Final Review', status: 'pending' }
            ];
        }

        return this.steps.map(step => `
            <li>
                <a href="#" 
                   data-step="${step.id}" 
                   class="${this.getStepClasses(step)}">
                    <span class="step-number">${step.number}</span>
                    <span class="step-title">${step.title}</span>
                </a>
            </li>
        `).join('');
    }

    /**
     * Get CSS classes for a step
     * @param {Object} step - Step object
     * @returns {string} - CSS classes
     */
    getStepClasses(step) {
        const classes = [];
        
        if (step.id === this.currentStep) {
            classes.push('active');
        }
        
        if (step.status === 'completed') {
            classes.push('completed');
        } else if (step.status === 'error') {
            classes.push('error');
        }

        return classes.join(' ');
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Handle step navigation clicks
        this.addEventListener(this.element, 'click', (e) => {
            if (e.target.closest('a[data-step]')) {
                e.preventDefault();
                const stepLink = e.target.closest('a[data-step]');
                const stepId = stepLink.dataset.step;
                this.setCurrentStep(stepId);
                this.emit('step-change', { stepId, step: this.getStep(stepId) });
            }
        });
    }

    /**
     * Set the current active step
     * @param {string} stepId - Step ID
     */
    setCurrentStep(stepId) {
        this.currentStep = stepId;
        this.updateStepClasses();
    }

    /**
     * Update step status
     * @param {string} stepId - Step ID
     * @param {string} status - New status (pending, active, completed, error)
     */
    updateStepStatus(stepId, status) {
        const step = this.steps.find(s => s.id === stepId);
        if (step) {
            step.status = status;
            this.updateStepClasses();
        }
    }

    /**
     * Update CSS classes for all steps
     */
    updateStepClasses() {
        this.steps.forEach(step => {
            const stepLink = this.find(`a[data-step="${step.id}"]`);
            if (stepLink) {
                // Remove all status classes
                stepLink.classList.remove('active', 'completed', 'error');
                
                // Add current classes
                const classes = this.getStepClasses(step).split(' ');
                classes.forEach(cls => {
                    if (cls.trim()) {
                        stepLink.classList.add(cls.trim());
                    }
                });
            }
        });
    }

    /**
     * Get step by ID
     * @param {string} stepId - Step ID
     * @returns {Object|null} - Step object or null
     */
    getStep(stepId) {
        return this.steps.find(s => s.id === stepId) || null;
    }

    /**
     * Get current step
     * @returns {Object|null} - Current step object or null
     */
    getCurrentStep() {
        return this.getStep(this.currentStep);
    }

    /**
     * Render the component
     */
    render() {
        const stepNav = this.find('.step-nav');
        if (stepNav) {
            stepNav.innerHTML = this.renderSteps();
        }
    }
}
