# Backend Service Layer Extraction - PR 2 Plan

## 🎯 Current State Analysis

### Current Architecture Issues
- **Monolithic server.js**: 747 lines with mixed concerns
- **HTTP routing + business logic**: Route handlers contain business logic
- **Direct data access**: Controllers directly call DataverseClient
- **No service boundaries**: Validation, deployment, and data access mixed together
- **Hard to test**: Business logic tightly coupled to HTTP layer

### Current File Structure
```
src/
├── server.js (747 lines) - HTTP server + route handlers + business logic
├── dataverse-client.js (1605 lines) - Data access layer
├── mermaid-parser.js - ERD parsing logic
└── azure-keyvault.js - Configuration management
```

## 🏗️ Proposed Service Layer Architecture

### New Structure
```
src/
├── server.js (simplified) - HTTP server + routing only
├── controllers/
│   ├── wizard-controller.js - HTTP request/response handling
│   ├── validation-controller.js - ERD validation endpoints  
│   ├── deployment-controller.js - Solution deployment endpoints
│   └── admin-controller.js - Publishers, choices, status endpoints
├── services/
│   ├── validation-service.js - ERD validation business logic
│   ├── deployment-service.js - Solution deployment orchestration
│   ├── publisher-service.js - Publisher management
│   ├── global-choices-service.js - Global choices management
│   └── solution-service.js - Solution status and management
├── repositories/
│   ├── dataverse-repository.js - Dataverse data access abstraction
│   └── configuration-repository.js - Config management abstraction
└── middleware/
    ├── error-handler.js - Centralized error handling
    ├── request-logger.js - Request logging
    └── response-streaming.js - Progress streaming utilities
```

## 🔄 Separation of Concerns

### 1. Controllers (HTTP Layer)
- **Responsibility**: HTTP request/response handling only
- **What they do**: Parse requests, validate input, call services, format responses
- **What they don't do**: Business logic, data access, complex validation

### 2. Services (Business Logic Layer)  
- **Responsibility**: Business logic and workflow orchestration
- **What they do**: Coordinate between repositories, implement business rules
- **What they don't do**: HTTP concerns, direct data access

### 3. Repositories (Data Access Layer)
- **Responsibility**: Data access abstraction
- **What they do**: Encapsulate DataverseClient calls, provide clean interfaces
- **What they don't do**: Business logic, HTTP concerns

### 4. Middleware (Cross-cutting Concerns)
- **Responsibility**: Shared functionality across the application
- **What they do**: Logging, error handling, streaming, authentication
- **What they don't do**: Business logic specific to domains

## 📋 Migration Strategy

### Phase 1: Extract Controllers
1. Create controller classes that wrap existing route handlers
2. Move HTTP-specific logic to controllers
3. Keep business logic in controllers temporarily
4. Test that all endpoints still work

### Phase 2: Extract Services  
1. Create service classes for business logic
2. Move business logic from controllers to services
3. Controllers become thin wrappers around services
4. Test that all workflows still work

### Phase 3: Extract Repositories
1. Create repository abstractions over DataverseClient
2. Services call repositories instead of DataverseClient directly
3. Add interface contracts for better testing
4. Test that all data operations still work

### Phase 4: Add Middleware
1. Extract shared concerns into middleware
2. Apply middleware to relevant routes
3. Clean up duplicated logic across controllers
4. Test that all cross-cutting concerns work

## 🎯 Benefits

### 1. **Single Responsibility Principle**
- Each class has one clear purpose
- Easier to understand and maintain
- Reduced cognitive load for developers

### 2. **Dependency Injection**
- Services can be easily mocked for testing
- Configuration becomes more flexible
- Better inversion of control

### 3. **Testability**
- Business logic can be unit tested independently
- HTTP layer can be integration tested
- Data access can be mocked/stubbed

### 4. **Maintainability**  
- Changes to business logic don't affect HTTP handling
- Changes to data access don't affect business logic
- Clear boundaries make refactoring safer

### 5. **Scalability**
- Services can be moved to separate processes/containers
- Caching can be added at repository level
- Rate limiting can be added at controller level

## 🚀 Implementation Steps for PR 2

### Step 1: Create Base Infrastructure
- [ ] Create directory structure
- [ ] Create base controller class
- [ ] Create base service class  
- [ ] Create base repository class

### Step 2: Extract Wizard Controller
- [ ] Create `WizardController` class
- [ ] Move `/wizard` route handling
- [ ] Test wizard UI still loads

### Step 3: Extract Validation Controller & Service
- [ ] Create `ValidationController` and `ValidationService`
- [ ] Move `/api/validate-erd` logic
- [ ] Test ERD validation still works

### Step 4: Extract Deployment Controller & Service  
- [ ] Create `DeploymentController` and `DeploymentService`
- [ ] Move `/upload` logic
- [ ] Test solution deployment still works

### Step 5: Extract Admin Controllers & Services
- [ ] Create `AdminController` with multiple services
- [ ] Move publishers, choices, status endpoints
- [ ] Test all admin endpoints still work

### Step 6: Extract Repository Layer
- [ ] Create `DataverseRepository`
- [ ] Abstract DataverseClient calls
- [ ] Update services to use repository
- [ ] Test all data operations still work

### Step 7: Add Middleware
- [ ] Create error handling middleware
- [ ] Create request logging middleware  
- [ ] Create response streaming middleware
- [ ] Apply to all routes and test

## ✅ Success Criteria

- [ ] **Zero Breaking Changes**: All existing endpoints work exactly as before
- [ ] **Clear Separation**: Each layer has distinct responsibilities
- [ ] **Testable Code**: Business logic can be unit tested
- [ ] **Maintainable Structure**: Easy to find and modify specific functionality
- [ ] **Performance Maintained**: No degradation in response times
- [ ] **Documentation Updated**: Clear guides for new architecture

## 🎯 Ready to Start

This plan provides a clear roadmap for extracting the backend into a clean, maintainable architecture while ensuring zero risk to existing functionality.
