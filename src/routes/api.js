// API routes for QR payments, invoices, owner settings, and audit logs
const express = require('express');
const router = express.Router();
const store = require('../models/store');
const ownerAuth = require('../middleware/auth');
const upload = require('../middleware/upload');

// 1. Owner Settings & QR Configuration
router.get('/owner/settings', ownerAuth, async (req, res) => {
  try {
    const settings = await store.getOwnerSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/owner/qr', ownerAuth, async (req, res) => {
  try {
    const { qrImageUrl } = req.body;
    if (!qrImageUrl || typeof qrImageUrl !== 'string') {
      return res.status(400).json({ error: 'Valid qrImageUrl is required' });
    }
    const settings = await store.updateOwnerSettings({ qrImageUrl });
    res.json({ success: true, message: 'Payment QR updated successfully', settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Invoices & Payment Instructions (Customer view includes configured QR)
router.post('/invoices', ownerAuth, async (req, res) => {
  try {
    const { customerName, amount, description } = req.body;
    if (amount === undefined || amount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount is required' });
    }
    const invoice = await store.createInvoice({ customerName, amount, description });
    res.status(201).json({ success: true, invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/invoices', ownerAuth, async (req, res) => {
  try {
    const invoices = await store.getAllInvoices();
    res.json({ success: true, invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/invoices/:id', async (req, res) => {
  try {
    const invoice = await store.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const settings = await store.getOwnerSettings();
    
    res.json({
      success: true,
      invoice,
      paymentInstructions: {
        qrImageUrl: settings.qrImageUrl,
        instructions: settings.qrImageUrl 
          ? 'Scan the QR code above using your mobile banking / payment app, complete the transfer, and submit your transaction reference and receipt below for verification.'
          : 'Payment QR code is not yet configured by the owner. Please contact support.'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Customer Payment Submission (Transaction Reference & Optional Receipt)
router.post('/invoices/:id/pay', upload.single('receipt'), async (req, res) => {
  try {
    const invoice = await store.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const { transactionRef } = req.body;
    if (!transactionRef || typeof transactionRef !== 'string' || transactionRef.trim() === '') {
      return res.status(400).json({ error: 'Transaction reference is required' });
    }

    const receiptPath = req.file ? `/uploads/${req.file.filename}` : null;

    const updatedInvoice = await store.submitPayment(req.params.id, {
      transactionRef: transactionRef.trim(),
      receiptPath
    });

    res.json({
      success: true,
      message: 'Payment details submitted successfully. Awaiting owner verification.',
      invoice: updatedInvoice
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Owner Verification / Approval
router.post('/invoices/:id/verify', ownerAuth, async (req, res) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Valid action ("approve" or "reject") is required' });
    }

    const invoice = await store.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const updatedInvoice = await store.verifyPayment(req.params.id, action);
    res.json({
      success: true,
      message: `Payment ${action === 'approve' ? 'approved and verified' : 'rejected'} successfully`,
      invoice: updatedInvoice
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Audit Logs
router.get('/owner/audit-logs', ownerAuth, async (req, res) => {
  try {
    const logs = await store.getAuditLogs();
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
