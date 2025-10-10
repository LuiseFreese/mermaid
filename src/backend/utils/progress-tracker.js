/**
 * Backend Progress Tracker
 * Enhanced progress tracking for backend operations with step management
 */

class ProgressTracker {
    constructor(operationType, progressCallback) {
        this.operationType = operationType;
        this.progressCallback = progressCallback || (() => {});
        this.steps = [];
        this.currentStep = null;
        this.startTime = Date.now();
        this.stepEstimates = {};
        this.completedSteps = [];
        
        this.initializeSteps();
    }

    /**
     * Initialize steps based on operation type
     */
    initializeSteps() {
        switch (this.operationType) {
            case 'deployment':
                this.steps = [
                    { id: 'validation', label: 'Validating ERD', estimate: 5 },
                    { id: 'publisher', label: 'Creating Publisher', estimate: 10 },
                    { id: 'solution', label: 'Setting up Solution', estimate: 15 },
                    { id: 'globalChoices', label: 'Creating Global Choices', estimate: 20 },
                    { id: 'entities', label: 'Creating Entities', estimate: 30 },
                    { id: 'relationships', label: 'Setting up Relationships', estimate: 25 },
                    { id: 'finalization', label: 'Finalizing Deployment', estimate: 10 }
                ];
                break;
            case 'rollback':
                this.steps = [
                    { id: 'preparation', label: 'Preparing Rollback', estimate: 5 },
                    { id: 'relationships', label: 'Removing Relationships', estimate: 15 },
                    { id: 'entities', label: 'Removing Custom Entities', estimate: 20 },
                    { id: 'globalChoices', label: 'Removing Global Choices', estimate: 10 },
                    { id: 'solution', label: 'Removing Solution', estimate: 10 },
                    { id: 'publisher', label: 'Removing Publisher', estimate: 5 },
                    { id: 'cleanup', label: 'Cleanup Operations', estimate: 5 }
                ];
                break;
            case 'validation':
                this.steps = [
                    { id: 'parsing', label: 'Parsing ERD Content', estimate: 2 },
                    { id: 'entityValidation', label: 'Validating Entities', estimate: 3 },
                    { id: 'relationshipValidation', label: 'Validating Relationships', estimate: 3 },
                    { id: 'cdmDetection', label: 'Detecting CDM Entities', estimate: 2 },
                    { id: 'finalValidation', label: 'Final Validation Checks', estimate: 2 }
                ];
                break;
            default:
                this.steps = [];
        }

        // Create step estimates map
        this.stepEstimates = this.steps.reduce((acc, step) => {
            acc[step.id] = step.estimate;
            return acc;
        }, {});
    }

    /**
     * Start a step
     */
    startStep(stepId, message) {
        this.currentStep = stepId;
        const step = this.steps.find(s => s.id === stepId);
        const stepLabel = step ? step.label : stepId;
        
        console.log(`🚀 PROGRESS: Starting step ${stepId} - ${stepLabel}`);
        
        this.sendProgress(stepId, message || stepLabel, {
            stepId,
            stepLabel,
            status: 'active',
            percentage: this.getProgressPercentage(),
            timeEstimate: this.getTimeEstimate()
        });
    }

    /**
     * Complete a step
     */
    completeStep(stepId, message) {
        if (!this.completedSteps.includes(stepId)) {
            this.completedSteps.push(stepId);
        }
        
        const step = this.steps.find(s => s.id === stepId);
        const stepLabel = step ? step.label : stepId;
        
        console.log(`✅ PROGRESS: Completed step ${stepId} - ${stepLabel}`);
        
        this.sendProgress(stepId, message || `${stepLabel} completed`, {
            stepId,
            stepLabel,
            status: 'completed',
            percentage: this.getProgressPercentage(),
            timeEstimate: this.getTimeEstimate()
        });
    }

    /**
     * Mark a step as failed
     */
    failStep(stepId, message, error) {
        const step = this.steps.find(s => s.id === stepId);
        const stepLabel = step ? step.label : stepId;
        
        console.error(`❌ PROGRESS: Failed step ${stepId} - ${stepLabel}:`, error);
        
        this.sendProgress(stepId, message || `${stepLabel} failed`, {
            stepId,
            stepLabel,
            status: 'error',
            percentage: this.getProgressPercentage(),
            timeEstimate: this.getTimeEstimate(),
            error: error?.message || error
        });
    }

    /**
     * Update step progress with custom message
     */
    updateStep(stepId, message, details = {}) {
        const step = this.steps.find(s => s.id === stepId);
        const stepLabel = step ? step.label : stepId;
        
        this.sendProgress(stepId, message, {
            stepId,
            stepLabel,
            status: 'active',
            percentage: this.getProgressPercentage(),
            timeEstimate: this.getTimeEstimate(),
            ...details
        });
    }

    /**
     * Send progress update
     */
    sendProgress(stepId, message, details = {}) {
        const progressData = {
            type: 'progress',
            operationType: this.operationType,
            currentStep: stepId,
            message,
            timestamp: new Date().toISOString(),
            steps: this.getAllStepsStatus(),
            ...details
        };

        this.progressCallback('progress', message, progressData);
    }

    /**
     * Get all steps with their current status
     */
    getAllStepsStatus() {
        return this.steps.map(step => ({
            id: step.id,
            label: step.label,
            status: this.completedSteps.includes(step.id) ? 'completed' :
                    step.id === this.currentStep ? 'active' : 'pending'
        }));
    }

    /**
     * Calculate progress percentage
     */
    getProgressPercentage() {
        if (this.steps.length === 0) return 0;
        return Math.round((this.completedSteps.length / this.steps.length) * 100);
    }

    /**
     * Get time estimate
     */
    getTimeEstimate() {
        const now = Date.now();
        const elapsedTime = Math.round((now - this.startTime) / 1000);
        
        // Calculate total estimated time
        const totalEstimatedTime = Object.values(this.stepEstimates).reduce((sum, time) => sum + time, 0);
        
        // Calculate remaining time based on completed steps
        const completedTime = this.completedSteps.reduce((sum, stepId) => 
            sum + (this.stepEstimates[stepId] || 0), 0);
        const estimatedRemainingTime = Math.max(0, totalEstimatedTime - completedTime);
        
        return {
            elapsedTime: this.formatTime(elapsedTime),
            estimatedRemainingTime: this.formatTime(estimatedRemainingTime),
            totalEstimatedTime: this.formatTime(totalEstimatedTime)
        };
    }

    /**
     * Format time in human readable format
     */
    formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }
    }

    /**
     * Mark operation as complete
     */
    complete(message = 'Operation completed successfully') {
        // Mark all steps as completed
        this.steps.forEach(step => {
            if (!this.completedSteps.includes(step.id)) {
                this.completedSteps.push(step.id);
            }
        });

        this.sendProgress('complete', message, {
            status: 'completed',
            percentage: 100,
            timeEstimate: this.getTimeEstimate(),
            completed: true
        });
    }

    /**
     * Mark operation as failed
     */
    fail(message = 'Operation failed', error) {
        this.sendProgress('failed', message, {
            status: 'error',
            percentage: this.getProgressPercentage(),
            timeEstimate: this.getTimeEstimate(),
            error: error?.message || error,
            failed: true
        });
    }

    /**
     * Check if a step exists
     */
    hasStep(stepId) {
        return this.steps.some(step => step.id === stepId);
    }

    /**
     * Check if a step is currently active
     */
    isStepActive(stepId) {
        return this.currentStep === stepId;
    }

    /**
     * Check if a step is completed
     */
    isStepCompleted(stepId) {
        return this.completedSteps.includes(stepId);
    }

    /**
     * Add a new step dynamically
     */
    addStep(stepId, label, estimate = 10) {
        if (!this.hasStep(stepId)) {
            this.steps.push({
                id: stepId,
                label: label,
                estimate: estimate,
                status: 'pending',
                startTime: null,
                endTime: null
            });
        }
    }
}

module.exports = { ProgressTracker };