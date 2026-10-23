// Durable database & file store for invoices, owner settings, and audit logs
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../data');
const dataFilePath = path.join(dataDir, 'store.json');

class Store {
  constructor() {
    this.useDb = !!process.env.DATABASE_URL;
    if (this.useDb) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Production environment requires DATABASE_URL for persistent storage. In-memory/file fallback is disabled on Render without a persistent disk.');
      }
      this.invoices = new Map();
      this.ownerSettings = {
        qrImageUrl: '',
        updatedAt: null
      };
      this.auditLogs = [];
      this.load();
    }
  }

  async init() {
    if (this.useDb) {
      try {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS owner_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT
          );
          CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY,
            customer_name TEXT,
            amount NUMERIC,
            description TEXT,
            status TEXT,
            transaction_ref TEXT,
            receipt_path TEXT,
            created_at TEXT,
            updated_at TEXT,
            verified_at TEXT
          );
          CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT,
            action TEXT,
            details TEXT,
            actor TEXT
          );
        `);
        const res = await this.pool.query('SELECT * FROM owner_settings WHERE key = $1', ['settings']);
        if (res.rows.length === 0) {
          await this.pool.query('INSERT INTO owner_settings (key, value, updated_at) VALUES ($1, $2, $3)', ['settings', '', null]);
        }
      } catch (err) {
        console.error('Database initialization error:', err);
        throw err;
      }
    }
  }

  async getOwnerSettings() {
    if (this.useDb) {
      const res = await this.pool.query('SELECT value, updated_at FROM owner_settings WHERE key = $1', ['settings']);
      if (res.rows.length > 0) {
        return { qrImageUrl: res.rows[0].value || '', updatedAt: res.rows[0].updated_at };
      }
      return { qrImageUrl: '', updatedAt: null };
    }
    return { ...this.ownerSettings };
  }

  async updateOwnerSettings(newSettings) {
    if (this.useDb) {
      const updatedAt = new Date().toISOString();
      const current = await this.getOwnerSettings();
      const qrImageUrl = newSettings.qrImageUrl !== undefined ? newSettings.qrImageUrl : current.qrImageUrl;
      await this.pool.query('UPDATE owner_settings SET value = $1, updated_at = $2 WHERE key = $3', [qrImageUrl, updatedAt, 'settings']);
      await this.addAuditLog('UPDATE_QR_SETTINGS', 'Owner updated payment QR settings', 'owner');
      return { qrImageUrl, updatedAt };
    }
    if (newSettings.qrImageUrl !== undefined) {
      this.ownerSettings.qrImageUrl = newSettings.qrImageUrl;
    }
    this.ownerSettings.updatedAt = new Date().toISOString();
    this.addAuditLog('UPDATE_QR_SETTINGS', 'Owner updated payment QR settings', 'owner');
    this.save();
    return { ...this.ownerSettings };
  }

  async createInvoice(data) {
    const id = 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const invoice = {
      id,
      customerName: data.customerName || 'Customer',
      amount: data.amount || 0,
      description: data.description || '',
      status: 'Pending',
      transactionRef: null,
      receiptPath: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      verifiedAt: null
    };

    if (this.useDb) {
      await this.pool.query(
        `INSERT INTO invoices (id, customer_name, amount, description, status, transaction_ref, receipt_path, created_at, updated_at, verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [invoice.id, invoice.customerName, invoice.amount, invoice.description, invoice.status, invoice.transactionRef, invoice.receiptPath, invoice.createdAt, invoice.updatedAt, invoice.verifiedAt]
      );
      await this.addAuditLog('CREATE_INVOICE', `Invoice ${id} created for amount ${invoice.amount}`, 'system');
      return invoice;
    }

    this.invoices.set(id, invoice);
    this.addAuditLog('CREATE_INVOICE', `Invoice ${id} created for amount ${invoice.amount}`, 'system');
    this.save();
    return invoice;
  }

  async getInvoice(id) {
    if (this.useDb) {
      const res = await this.pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        customerName: r.customer_name,
        amount: parseFloat(r.amount),
        description: r.description,
        status: r.status,
        transactionRef: r.transaction_ref,
        receiptPath: r.receipt_path,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        verifiedAt: r.verified_at
      };
    }
    return this.invoices.get(id) || null;
  }

  async getAllInvoices() {
    if (this.useDb) {
      const res = await this.pool.query('SELECT * FROM invoices');
      return res.rows.map(r => ({
        id: r.id,
        customerName: r.customer_name,
        amount: parseFloat(r.amount),
        description: r.description,
        status: r.status,
        transactionRef: r.transaction_ref,
        receiptPath: r.receipt_path,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        verifiedAt: r.verified_at
      }));
    }
    return Array.from(this.invoices.values());
  }

  async submitPayment(id, { transactionRef, receiptPath }) {
    const invoice = await this.getInvoice(id);
    if (!invoice) return null;

    const status = 'Submitted for Verification';
    const updatedAt = new Date().toISOString();
    const tRef = transactionRef || null;
    const rPath = receiptPath || invoice.receiptPath || null;

    if (this.useDb) {
      await this.pool.query(
        `UPDATE invoices SET status = $1, transaction_ref = $2, receipt_path = $3, updated_at = $4 WHERE id = $5`,
        [status, tRef, rPath, updatedAt, id]
      );
      await this.addAuditLog(
        'SUBMIT_PAYMENT',
        `Customer submitted payment for invoice ${id} with ref: ${tRef || 'none'}`,
        'customer'
      );
      return await this.getInvoice(id);
    }

    invoice.status = status;
    invoice.transactionRef = tRef;
    invoice.receiptPath = rPath;
    invoice.updatedAt = updatedAt;
    this.invoices.set(id, invoice);
    this.addAuditLog(
      'SUBMIT_PAYMENT',
      `Customer submitted payment for invoice ${id} with ref: ${tRef || 'none'}`,
      'customer'
    );
    this.save();
    return invoice;
  }

  async verifyPayment(id, action, ownerIdentity = 'owner') {
    const invoice = await this.getInvoice(id);
    if (!invoice) return null;

    let status = invoice.status;
    let verifiedAt = invoice.verifiedAt;
    const updatedAt = new Date().toISOString();

    if (action === 'approve') {
      status = 'Verified/Paid';
      verifiedAt = updatedAt;
      await this.addAuditLog('VERIFY_PAYMENT_APPROVED', `Owner approved payment for invoice ${id}`, ownerIdentity);
    } else if (action === 'reject') {
      status = 'Rejected';
      await this.addAuditLog('VERIFY_PAYMENT_REJECTED', `Owner rejected payment for invoice ${id}`, ownerIdentity);
    }

    if (this.useDb) {
      await this.pool.query(
        `UPDATE invoices SET status = $1, verified_at = $2, updated_at = $3 WHERE id = $4`,
        [status, verifiedAt, updatedAt, id]
      );
      return await this.getInvoice(id);
    }

    invoice.status = status;
    invoice.verifiedAt = verifiedAt;
    invoice.updatedAt = updatedAt;
    this.invoices.set(id, invoice);
    this.save();
    return invoice;
  }

  async addAuditLog(action, details, actor) {
    const log = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      action,
      details,
      actor
    };

    if (this.useDb) {
      await this.pool.query(
        `INSERT INTO audit_logs (id, timestamp, action, details, actor) VALUES ($1, $2, $3, $4, $5)`,
        [log.id, log.timestamp, log.action, log.details, log.actor]
      );
      return log;
    }

    this.auditLogs.push(log);
    this.save();
    return log;
  }

  async getAuditLogs() {
    if (this.useDb) {
      const res = await this.pool.query('SELECT * FROM audit_logs ORDER BY timestamp ASC');
      return res.rows.map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        action: r.action,
        details: r.details,
        actor: r.actor
      }));
    }
    return [...this.auditLogs];
  }

  load() {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      if (fs.existsSync(dataFilePath)) {
        const raw = fs.readFileSync(dataFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.invoices) {
          this.invoices = new Map(data.invoices);
        }
        if (data.ownerSettings) {
          this.ownerSettings = data.ownerSettings;
        }
        if (Array.isArray(data.auditLogs)) {
          this.auditLogs = data.auditLogs;
        }
      }
    } catch (err) {
      console.error('Error loading store data:', err);
    }
  }

  save() {
    if (this.useDb) return;
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const data = {
        invoices: Array.from(this.invoices.entries()),
        ownerSettings: this.ownerSettings,
        auditLogs: this.auditLogs
      };
      fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving store data:', err);
    }
  }

  async reset() {
    if (this.useDb) {
      await this.pool.query('DELETE FROM invoices');
      await this.pool.query('DELETE FROM audit_logs');
      await this.pool.query('UPDATE owner_settings SET value = $1, updated_at = $2 WHERE key = $3', ['', null, 'settings']);
      return;
    }
    this.invoices.clear();
    this.ownerSettings = { qrImageUrl: '', updatedAt: null };
    this.auditLogs = [];
    try {
      if (fs.existsSync(dataFilePath)) {
        fs.unlinkSync(dataFilePath);
      }
    } catch (e) {}
  }
}

const store = new Store();
module.exports = store;
