/**
 * Base Component Class
 * Provides common functionality for all UI components
 */
export class Component {
    constructor(element = null) {
        this.element = element;
        this.listeners = new Map();
        this.children = new Map();
        this.state = {};
        this.initialized = false;
    }

    /**
     * Create component from HTML template
     * @param {string} template - HTML template string
     * @returns {HTMLElement} - Created element
     */
    createFromTemplate(template) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = template.trim();
        return wrapper.firstElementChild;
    }

    /**
     * Initialize the component
     */
    init() {
        if (this.initialized) return;
        
        this.bindEvents();
        this.render();
        this.initialized = true;
        this.onInit();
    }

    /**
     * Override this method in child components
     */
    onInit() {
        // Override in child components
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Override in child components
    }

    /**
     * Render the component
     */
    render() {
        // Override in child components
    }

    /**
     * Update component state
     * @param {Object} newState - New state object
     */
    setState(newState) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...newState };
        this.onStateChange(prevState, this.state);
    }

    /**
     * Handle state changes
     * @param {Object} _prevState - Previous state
     * @param {Object} _newState - New state
     */
    onStateChange(_prevState, _newState) {
        // Override in child components if needed
        this.render();
    }

    /**
     * Add event listener and track it for cleanup
     * @param {HTMLElement} element - Element to attach listener to
     * @param {string} event - Event type
     * @param {Function} handler - Event handler
     * @param {Object} options - Event options
     */
    addEventListener(element, event, handler, options = {}) {
        element.addEventListener(event, handler, options);
        
        const key = `${element.constructor.name}-${event}-${Date.now()}`;
        this.listeners.set(key, { element, event, handler, options });
    }

    /**
     * Remove all event listeners
     */
    removeEventListeners() {
        this.listeners.forEach(({ element, event, handler, options }) => {
            element.removeEventListener(event, handler, options);
        });
        this.listeners.clear();
    }

    /**
     * Add child component
     * @param {string} name - Child component name
     * @param {Component} component - Child component instance
     */
    addChild(name, component) {
        this.children.set(name, component);
    }

    /**
     * Get child component
     * @param {string} name - Child component name
     * @returns {Component|null} - Child component or null
     */
    getChild(name) {
        return this.children.get(name) || null;
    }

    /**
     * Remove child component
     * @param {string} name - Child component name
     */
    removeChild(name) {
        const child = this.children.get(name);
        if (child) {
            child.destroy();
            this.children.delete(name);
        }
    }

    /**
     * Find element within component
     * @param {string} selector - CSS selector
     * @returns {HTMLElement|null} - Found element or null
     */
    find(selector) {
        return this.element ? this.element.querySelector(selector) : null;
    }

    /**
     * Find all elements within component
     * @param {string} selector - CSS selector
     * @returns {NodeList} - Found elements
     */
    findAll(selector) {
        return this.element ? this.element.querySelectorAll(selector) : [];
    }

    /**
     * Show the component
     */
    show() {
        if (this.element) {
            this.element.classList.remove('hidden');
        }
    }

    /**
     * Hide the component
     */
    hide() {
        if (this.element) {
            this.element.classList.add('hidden');
        }
    }

    /**
     * Toggle component visibility
     */
    toggle() {
        if (this.element) {
            this.element.classList.toggle('hidden');
        }
    }

    /**
     * Check if component is visible
     * @returns {boolean} - True if visible
     */
    isVisible() {
        return this.element && !this.element.classList.contains('hidden');
    }

    /**
     * Add CSS class
     * @param {string} className - CSS class name
     */
    addClass(className) {
        if (this.element) {
            this.element.classList.add(className);
        }
    }

    /**
     * Remove CSS class
     * @param {string} className - CSS class name
     */
    removeClass(className) {
        if (this.element) {
            this.element.classList.remove(className);
        }
    }

    /**
     * Toggle CSS class
     * @param {string} className - CSS class name
     */
    toggleClass(className) {
        if (this.element) {
            this.element.classList.toggle(className);
        }
    }

    /**
     * Check if element has CSS class
     * @param {string} className - CSS class name
     * @returns {boolean} - True if has class
     */
    hasClass(className) {
        return this.element && this.element.classList.contains(className);
    }

    /**
     * Emit custom event
     * @param {string} eventName - Event name
     * @param {*} detail - Event detail data
     */
    emit(eventName, detail = null) {
        if (this.element) {
            const event = new CustomEvent(eventName, { 
                detail, 
                bubbles: true, 
                cancelable: true 
            });
            this.element.dispatchEvent(event);
        }
    }

    /**
     * Destroy the component and cleanup resources
     */
    destroy() {
        // Destroy all child components
        this.children.forEach(child => child.destroy());
        this.children.clear();

        // Remove all event listeners
        this.removeEventListeners();

        // Remove element from DOM
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }

        // Clear references
        this.element = null;
        this.state = {};
        this.initialized = false;
    }

    /**
     * Get component HTML as string
     * @returns {string} - Component HTML
     */
    toString() {
        return this.element ? this.element.outerHTML : '';
    }
}