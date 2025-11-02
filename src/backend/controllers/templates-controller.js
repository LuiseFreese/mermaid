const { BaseController } = require('./base-controller');
const fs = require('fs');
const path = require('path');

class TemplatesController extends BaseController {
  constructor(deps = {}) {
    super();
    this.templatesDir = deps.templatesDir || path.join(__dirname, '../../data/templates');
    if (!fs.existsSync(this.templatesDir)) fs.mkdirSync(this.templatesDir, { recursive: true });
  }

  async listTemplates(req, res) {
    try {
      const files = fs.readdirSync(this.templatesDir).filter(f => f.endsWith('.json'));
      const templates = files.map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(this.templatesDir, f), 'utf8')); } catch { return null; }
      }).filter(Boolean);
      this.sendSuccess(res, { data: templates });
    } catch (err) {
      this.sendInternalError(res, 'Failed to list templates', err);
    }
  }

  async createTemplate(req, res) {
    try {
      const data = await this.parseRequestBody(req);
      if (!data || !data.name) return this.sendBadRequest(res, 'Template must include name');
      const id = `template_${Date.now()}`;
      data.id = id;
      fs.writeFileSync(path.join(this.templatesDir, `${id}.json`), JSON.stringify(data, null, 2));
      this.sendSuccess(res, { data });
    } catch (err) {
      this.sendInternalError(res, 'Failed to create template', err);
    }
  }

  async getTemplate(req, res) {
    try {
      const routeParts = req.url.replace('/api/templates/', '').split('?')[0].split('/');
      const id = routeParts[0];
      const file = path.join(this.templatesDir, `${id}.json`);
      if (!fs.existsSync(file)) return this.sendError(res, 404, 'Not found');
      const template = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.sendSuccess(res, { data: template });
    } catch (err) {
      this.sendInternalError(res, 'Failed to read template', err);
    }
  }

  async deleteTemplate(req, res) {
    try {
      const routeParts = req.url.replace('/api/templates/', '').split('?')[0].split('/');
      const id = routeParts[0];
      const file = path.join(this.templatesDir, `${id}.json`);
      if (!fs.existsSync(file)) return this.sendError(res, 404, 'Not found');
      fs.unlinkSync(file);
      this.sendSuccess(res, {});
    } catch (err) {
      this.sendInternalError(res, 'Failed to delete template', err);
    }
  }
}

module.exports = { TemplatesController };
