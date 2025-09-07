import { Component } from '../base/component.js';

/**
 * Solution Page Component
 * Handles publisher selection and solution configuration
 */
export class SolutionPage extends Component {
    constructor(wizardState, apiClient) {
        super();
        this.wizardState = wizardState;
        this.apiClient = apiClient;
        this.element = this.createElement();
        this.init();
    }

    /**
     * Create the solution page element
     * @returns {HTMLElement} - Page element
     */
    createElement() {
        const template = `
            <div class="page" id="page-solution">
                <div class="page-header">
                    <h2 class="page-title">Solution & Publisher Configuration</h2>
                    <p class="page-description">Configure your Dataverse solution and publisher settings.</p>
                </div>

                <div class="section">
                    <div class="message-card info">
                        <i class="fas fa-info-circle message-icon"></i>
                        <div class="message-content">
                            <div class="message-title">Coming Soon</div>
                            <div class="message-description">
                                Solution and publisher configuration will be implemented in the next iteration.
                            </div>
                        </div>
                    </div>
                </div>

                <div class="actions-bar">
                    <button type="button" id="prevBtn" class="btn btn-secondary">
                        <i class="fas fa-arrow-left"></i>
                        Previous
                    </button>
                    <button type="button" id="nextBtn" class="btn btn-primary">
                        Next: Global Choices
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `;
        return this.createFromTemplate(template);
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        const prevBtn = this.find('#prevBtn');
        const nextBtn = this.find('#nextBtn');

        if (prevBtn) {
            this.addEventListener(prevBtn, 'click', () => {
                this.emit('navigate-previous', { step: 'validation' });
            });
        }

        if (nextBtn) {
            this.addEventListener(nextBtn, 'click', () => {
                this.emit('navigate-next', { step: 'choices' });
            });
        }
    }

    /**
     * Render the component
     */
    render() {
        // Implementation will be added in future iterations
    }
}
