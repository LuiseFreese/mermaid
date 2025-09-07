import { Component } from '../base/component.js';

/**
 * App Header Component
 * Displays the main application header with title and subtitle
 */
export class AppHeader extends Component {
    constructor(title = 'Mermaid to Dataverse Converter', subtitle = 'Enterprise ERD to Microsoft Dataverse Transformation') {
        super();
        this.title = title;
        this.subtitle = subtitle;
        this.element = this.createElement();
        this.init();
    }

    /**
     * Create the header element
     * @returns {HTMLElement} - Header element
     */
    createElement() {
        const template = `
            <header class="header">
                <div>
                    <h1>${this.title}</h1>
                    <div class="subtitle">${this.subtitle}</div>
                </div>
            </header>
        `;
        return this.createFromTemplate(template);
    }

    /**
     * Update header title
     * @param {string} title - New title
     */
    setTitle(title) {
        this.title = title;
        const h1 = this.find('h1');
        if (h1) {
            h1.textContent = title;
        }
    }

    /**
     * Update header subtitle
     * @param {string} subtitle - New subtitle
     */
    setSubtitle(subtitle) {
        this.subtitle = subtitle;
        const subtitleEl = this.find('.subtitle');
        if (subtitleEl) {
            subtitleEl.textContent = subtitle;
        }
    }

    /**
     * Render the component
     */
    render() {
        // Header content is static, no dynamic rendering needed
    }
}
