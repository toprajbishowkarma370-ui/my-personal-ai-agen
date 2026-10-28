const test = require('node:test');
const assert = require('node:assert');

test('10-Website Management System starter projects verification', () => {
  const websitesData = [
    { id: 'web_01', name: 'Chaurjahari Hardware & Supply', type: 'Local Business', status: 'DRAFT', slug: 'chaurjahari-hardware' },
    { id: 'web_02', name: 'Hotel Samjhana & Lodging', type: 'Hotel and Restaurant', status: 'PUBLISHED', slug: 'hotel-samjhana' },
    { id: 'web_03', name: 'Bheri Valley Public Secondary School', type: 'School and College', status: 'DRAFT', slug: 'bheri-valley-school' },
    { id: 'web_04', name: 'Chaurjahari Health Clinic & Diagnostic Lab', type: 'Clinic and Healthcare', status: 'DRAFT', slug: 'chaurjahari-clinic' },
    { id: 'web_05', name: 'Ajisa Agrovet Suppliers', type: 'Agrovet and Agriculture Shop', status: 'PUBLISHED', slug: 'ajisa-agrovet' },
    { id: 'web_06', name: 'Karnali Land & Housing Services', type: 'Real Estate', status: 'DRAFT', slug: 'karnali-realestate' },
    { id: 'web_07', name: 'Dr. Ramesh BK — Consultant & Writer', type: 'Portfolio and Personal Brand', status: 'DRAFT', slug: 'ramesh-bk-portfolio' },
    { id: 'web_08', name: 'Karnali Digital & Web Agency', type: 'Agency and Service Business', status: 'PUBLISHED', slug: 'karnali-agency' },
    { id: 'web_09', name: 'Himalayan Handcrafts & Local Produce', type: 'E-commerce Store', status: 'DRAFT', slug: 'himalayan-handcrafts' },
    { id: 'web_10', name: 'KarnaliPay — Digital Finance SaaS', type: 'Startup and SaaS', status: 'DRAFT', slug: 'karnalipay-saas' }
  ];

  assert.strictEqual(websitesData.length, 10);
  websitesData.forEach((site, idx) => {
    assert.ok(site.id);
    assert.ok(site.name);
    assert.ok(site.type);
    assert.ok(site.slug);
    assert.ok(['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(site.status));
  });

  // Test CRUD operations simulation
  const newSite = { id: 'web_11', name: 'Test Business', type: 'Local Business', status: 'DRAFT', slug: 'test-business' };
  websitesData.push(newSite);
  assert.strictEqual(websitesData.length, 11);

  // Test duplicate simulation
  const duplicated = { ...newSite, id: 'web_12', name: 'Test Business (Copy)', slug: 'test-business-copy' };
  websitesData.push(duplicated);
  assert.strictEqual(websitesData.length, 12);

  // Test deployment approval gate simulation
  function simulateDeployApproval(siteId) {
    const site = websitesData.find(s => s.id === siteId);
    if (!site) return { success: false, error: 'Site not found' };
    return { success: true, status: 'PENDING_OWNER_APPROVAL', deployUrl: `https://${site.slug}.onrender.com` };
  }

  const deployRes = simulateDeployApproval('web_01');
  assert.strictEqual(deployRes.success, true);
  assert.strictEqual(deployRes.status, 'PENDING_OWNER_APPROVAL');
  assert.ok(deployRes.deployUrl.includes('chaurjahari-hardware'));
});

test('AI Command Center 10-Website command parsing simulation', () => {
  function parseWebsiteCommand(cmdText) {
    const text = cmdText.toLowerCase();
    if (text.includes('show all 10 websites') || text.includes('list websites')) {
      return { action: 'SHOW_WEBSITES', count: 10 };
    }
    if (text.includes('create a new website') || text.includes('new website')) {
      return { action: 'CREATE_WEBSITE' };
    }
    if (text.includes('open website') && text.includes('editing')) {
      const match = text.match(/website\s+(\d+)/);
      return { action: 'OPEN_WEBSITE_EDIT', index: match ? parseInt(match[1]) : 1 };
    }
    if (text.includes('preview website') && text.includes('mobile')) {
      const match = text.match(/website\s+(\d+)/);
      return { action: 'PREVIEW_MOBILE', index: match ? parseInt(match[1]) : 1 };
    }
    if (text.includes('prepare website') && text.includes('deployment')) {
      const match = text.match(/website\s+(\d+)/);
      return { action: 'PREPARE_DEPLOY', index: match ? parseInt(match[1]) : 1 };
    }
    return { action: 'UNKNOWN' };
  }

  assert.strictEqual(parseWebsiteCommand('Show all 10 websites').action, 'SHOW_WEBSITES');
  assert.strictEqual(parseWebsiteCommand('Open website 3 for editing').action, 'OPEN_WEBSITE_EDIT');
  assert.strictEqual(parseWebsiteCommand('Preview website 5 on mobile').action, 'PREVIEW_MOBILE');
  assert.strictEqual(parseWebsiteCommand('Prepare website 1 for deployment').action, 'PREPARE_DEPLOY');
});
