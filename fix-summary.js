// Fixed generateSummary function to replace the old one
function generateSummary() {
    const container = document.getElementById('deploymentSummary');
    
    // Determine publisher information
    let publisherInfo = 'Not configured';
    if (wizard.stepData.publisher.type === 'existing' && wizard.stepData.publisher.selectedPublisher) {
        try {
            const publisherData = JSON.parse(wizard.stepData.publisher.selectedPublisher);
            publisherInfo = publisherData.friendlyName;
        } catch (e) {
            publisherInfo = 'Selected existing publisher';
        }
    } else if (wizard.stepData.publisher.type === 'new') {
        const publisherName = document.getElementById('publisherName')?.value;
        if (publisherName && publisherName.trim()) {
            publisherInfo = `${publisherName.trim()} (New)`;
        } else {
            publisherInfo = 'Creating new publisher';
        }
    }
    
    // Get selected global choices
    const selectedChoices = [];
    document.querySelectorAll('#globalChoicesCheckbox input:checked').forEach(input => {
        const label = input.nextElementSibling;
        if (label) {
            const choiceName = label.querySelector('strong')?.textContent || 'Unknown';
            const choiceId = label.querySelector('.text-muted')?.textContent || input.value;
            selectedChoices.push(`${choiceName} (${choiceId})`);
        }
    });
    
    // Get entity details
    const entityDetails = wizard.stepData.validation.entities.map(entity => 
        `${entity.logicalName} - ${entity.displayName || 'No display name'}`
    );
    
    // Get relationship details
    const relationshipDetails = wizard.stepData.validation.relationships.map(rel => 
        `${rel.fromEntity} → ${rel.toEntity} (${rel.type})`
    );

    // Create publisher details array
    let publisherDetails = [publisherInfo];
    if (wizard.stepData.publisher.type === 'new') {
        const publisherUniqueName = document.getElementById('publisherUniqueName')?.value;
        const publisherPrefix = document.getElementById('publisherPrefix')?.value;
        publisherDetails = [
            publisherInfo,
            `Unique Name: ${publisherUniqueName || 'Auto-generated'}`,
            `Prefix: ${publisherPrefix || 'Auto-generated'}`
        ];
    }

    const summaryItems = [
        {
            title: 'Solution',
            count: 1,
            details: [document.getElementById('solutionName')?.value || 'Not specified']
        },
        {
            title: 'Publisher',
            count: 1,
            details: publisherDetails
        },
        {
            title: 'Entities',
            count: wizard.stepData.validation.entities.length,
            details: entityDetails
        },
        {
            title: 'Relationships',
            count: wizard.stepData.validation.relationships.length,
            details: relationshipDetails
        },
        {
            title: 'Global Choices',
            count: selectedChoices.length,
            details: selectedChoices
        }
    ];

    container.innerHTML = `
        <div class="summary-list">
            ${summaryItems.map((item, index) => `
                <div class="summary-item">
                    <div class="summary-header" onclick="toggleSummaryItem(${index})">
                        <div class="summary-title">
                            <span class="summary-count">${item.count}</span>
                            <span class="summary-label">${item.title}</span>
                        </div>
                        <span class="summary-toggle">▼</span>
                    </div>
                    <div class="summary-details" id="summary-details-${index}">
                        ${item.details.length > 0 ? 
                            `<ul>${item.details.map(detail => `<li>${detail}</li>`).join('')}</ul>` : 
                            '<p class="no-items">None configured</p>'
                        }
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}
