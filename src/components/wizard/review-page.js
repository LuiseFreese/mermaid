import { Component } from '../base/component.js';

/**
 * Review Page Component
 * Handles final review and deployment
 */
export class ReviewPage extends Component {
    constructor(wizardState, apiClient) {
        super();
        this.wizardState = wizardState;
        this.apiClient = apiClient;
        this.element = this.createElement();
        this.init();
    }

    /**
     * Create the review page element
     * @returns {HTMLElement} - Page element
     */
    createElement() {
        const template = `
            <div class="page" id="page-review">
                <div class="page-header">
                    <h2 class="page-title">Review & Deploy</h2>
                    <p class="page-description">Review your configuration and deploy to Dataverse.</p>
                </div>

                <div class="section">
                    <div class="message-card info">
                        <i class="fas fa-info-circle message-icon"></i>
                        <div class="message-content">
                            <div class="message-title">Coming Soon</div>
                            <div class="message-description">
                                Review and deployment functionality will be implemented in the next iteration.
                            </div>
                        </div>
                    </div>
                </div>

                <div class="actions-bar">
                    <button type="button" id="prevBtn" class="btn btn-secondary">
                        <i class="fas fa-arrow-left"></i>
                        Previous
                    </button>
                    <button type="button" id="deployBtn" class="btn btn-primary">
                        <i class="fas fa-rocket"></i>
                        Deploy to Dataverse
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
        const deployBtn = this.find('#deployBtn');

        if (prevBtn) {
            this.addEventListener(prevBtn, 'click', () => {
                this.emit('navigate-previous', { step: 'choices' });
            });
        }

        if (deployBtn) {
            this.addEventListener(deployBtn, 'click', () => {
                this.handleDeploy();
            });
        }
    }

    /**
     * Handle deployment
     */
    async handleDeploy() {
        try {
            // Show placeholder for now
            alert('Deployment functionality will be implemented in the next iteration.');
        } catch (error) {
            console.error('Deployment failed:', error);
        }
    }

    /**
     * Render the component
     */
    render() {
        // Implementation will be added in future iterations
    }
}
