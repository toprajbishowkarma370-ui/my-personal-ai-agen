const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding demo data for My Personal AI Business Agent...");

  const ownerEmail = "alex.morgan@agency.local";

  const leadData = [
    { company: "Hotel Samjhana & Lodging", category: "Hospitality", tier: 1, score: 92, status: "WAITING_APPROVAL", notes: "Family-run hotel near Bheri Bridge. No website. High walk-in tourist traffic." },
    { company: "Bheri Valley Public Secondary School", category: "Education", tier: 1, score: 88, status: "WAITING_APPROVAL", notes: "Public secondary school needs admissions portal and info site." },
    { company: "Karnali Community Clinic", category: "Healthcare", tier: 1, score: 85, status: "CONTACTED", notes: "Community clinic wants appointment booking and doctor profiles." },
    { company: "Karnali Agrovet & Seed Store", category: "Agriculture", tier: 2, score: 80, status: "WAITING_APPROVAL", notes: "Agrovet shop seeks product catalog and seasonal farming guidance pages." },
    { company: "Himalayan Realty Karnali", category: "Real Estate", tier: 2, score: 78, status: "INTERESTED", notes: "Real estate agent wants property listings with contact forms." },
    { company: "Chaurjahari General Store", category: "Local Business", tier: 3, score: 70, status: "WAITING_APPROVAL", notes: "General store wants online presence for groceries and essentials." },
    { company: "Karnali Mart", category: "E-commerce", tier: 3, score: 65, status: "WAITING_APPROVAL", notes: "Local grocer interested in delivery and online ordering." },
    { company: "Aasha Gurung — Designer & Developer", category: "Portfolio", tier: 2, score: 75, status: "CONTACTED", notes: "Freelancer wants a personal portfolio site." },
    { company: "Karnali Digital Agency", category: "Agency", tier: 2, score: 72, status: "WAITING_APPROVAL", notes: "Digital agency wants service packages and case studies site." },
    { company: "Karnali SaaS Platform", category: "Startup", tier: 1, score: 90, status: "WAITING_APPROVAL", notes: "SaaS startup needs landing page with pricing and signup." },
  ];

  const createdLeads = [];
  for (const ld of leadData) {
    const existing = await prisma.lead.findFirst({ where: { company: ld.company } });
    if (existing) { createdLeads.push(existing); continue; }
    const lead = await prisma.lead.create({ data: ld });
    createdLeads.push(lead);
    console.log(`Created lead: ${lead.company} (${lead.status})`);
  }

  const customerData = [
    { name: "Hotel Samjhana & Lodging", phone: "+977 9800000001", email: "info@hotelsamjhana.com.np", location: "Bheri Bridge, Chaurjahari, Karnali" },
    { name: "Karnali Community Clinic", phone: "+977 9800000002", email: "clinic@karnalihealth.com.np", location: "Chaurjahari Bazar, Karnali" },
  ];

  const createdCustomers = [];
  for (const cd of customerData) {
    const existing = await prisma.customer.findFirst({ where: { email: cd.email } });
    if (existing) { createdCustomers.push(existing); continue; }
    const customer = await prisma.customer.create({ data: cd });
    createdCustomers.push(customer);
    console.log(`Created customer: ${customer.name}`);
  }

  const hotelLead = createdLeads.find((l) => l.company === "Hotel Samjhana & Lodging");
  const clinicLead = createdLeads.find((l) => l.company === "Karnali Community Clinic");
  const hotelCustomer = createdCustomers.find((c) => c.name === "Hotel Samjhana & Lodging");
  const clinicCustomer = createdCustomers.find((c) => c.name === "Karnali Community Clinic");

  if (hotelLead && hotelCustomer && hotelLead.customerId === null) {
    await prisma.lead.update({ where: { id: hotelLead.id }, data: { customerId: hotelCustomer.id, status: "CONVERTED" } });
    console.log(`Converted lead ${hotelLead.company} to customer`);
  }
  if (clinicLead && clinicCustomer && clinicLead.customerId === null) {
    await prisma.lead.update({ where: { id: clinicLead.id }, data: { customerId: clinicCustomer.id, status: "CONVERTED" } });
    console.log(`Converted lead ${clinicLead.company} to customer`);
  }

  const taskData = [
    { title: "Reach out to Hotel Samjhana about website proposal", status: "PLANNED", priority: "HIGH", leadId: hotelLead ? hotelLead.id : null },
    { title: "Draft Nepali outreach for Karnali Agrovet", status: "PLANNED", priority: "MEDIUM", leadId: createdLeads.find((l) => l.company === "Karnali Agrovet & Seed Store") ? createdLeads.find((l) => l.company === "Karnali Agrovet & Seed Store").id : null },
    { title: "Follow up with Himalayan Realty on property listing site", status: "IN_PROGRESS", priority: "HIGH", leadId: createdLeads.find((l) => l.company === "Himalayan Realty Karnali") ? createdLeads.find((l) => l.company === "Himalayan Realty Karnali").id : null },
    { title: "Setup clinic appointment booking page", status: "PLANNED", priority: "MEDIUM", leadId: clinicLead ? clinicLead.id : null },
  ];
  for (const td of taskData) {
    if (!td.leadId) continue;
    const existing = await prisma.task.findFirst({ where: { title: td.title } });
    if (!existing) { await prisma.task.create({ data: td }); console.log(`Created task: ${td.title}`); }
  }

  const proposalData = [
    { title: "Hotel Samjhana — Website & Online Booking Proposal", content: "A full website with room listings, booking form, and gallery for Hotel Samjhana & Lodging. Includes mobile-responsive design and owner training.", value: 25000, status: "DRAFT" },
    { title: "Karnali Community Clinic — Patient Portal Proposal", content: "Clinic website with doctor profiles, services, and appointment booking system.", value: 20000, status: "DRAFT" },
    { title: "Himalayan Realty — Property Listing Portal Proposal", content: "Real estate site with property search, filters, and agent contact forms.", value: 30000, status: "DRAFT" },
  ];
  for (const pd of proposalData) {
    const existing = await prisma.proposal.findFirst({ where: { title: pd.title } });
    if (!existing) { await prisma.proposal.create({ data: pd }); console.log(`Created proposal: ${pd.title}`); }
  }

  const invoiceData = [
    { customerId: hotelCustomer ? hotelCustomer.id : null, title: "Website Development — Hotel Samjhana", items: JSON.stringify([{ name: "Hotel website with booking", qty: 1, price: 25000 }]), subtotal: 25000, tax: 0, total: 25000, currency: "NPR", status: "ISSUED", dueDate: new Date(Date.now() + 14 * 86400000) },
    { customerId: clinicCustomer ? clinicCustomer.id : null, title: "Clinic Patient Portal — Karnali Community Clinic", items: JSON.stringify([{ name: "Appointment booking + doctor profiles", qty: 1, price: 20000 }]), subtotal: 20000, tax: 0, total: 20000, currency: "NPR", status: "ISSUED", dueDate: new Date(Date.now() + 10 * 86400000) },
  ];
  for (const inv of invoiceData) {
    if (!inv.customerId) continue;
    const existing = await prisma.invoice.findFirst({ where: { title: inv.title } });
    if (!existing) {
      const created = await prisma.invoice.create({ data: inv, include: { customer: true } });
      console.log(`Created invoice: ${created.invoiceNumber} for ${created.customer.name}`);
    }
  }

  const websiteData = [
    { name: "Hotel Samjhana Website", template: "hotel-restaurant", status: "PUBLISHED", ownerApproved: true, ownerApprovedBy: ownerEmail, customerId: hotelCustomer ? hotelCustomer.id : null, leadId: hotelLead ? hotelLead.id : null },
    { name: "Karnali Community Clinic", template: "clinic-healthcare", status: "APPROVED", ownerApproved: true, ownerApprovedBy: ownerEmail, customerId: clinicCustomer ? clinicCustomer.id : null, leadId: clinicLead ? clinicLead.id : null },
    { name: "Karnali Agrovet Store", template: "agrovet-agriculture", status: "DRAFT", ownerApproved: false, customerId: null, leadId: createdLeads.find((l) => l.company === "Karnali Agrovet & Seed Store") ? createdLeads.find((l) => l.company === "Karnali Agrovet & Seed Store").id : null },
  ];
  for (const wd of websiteData) {
    const existing = await prisma.website.findFirst({ where: { name: wd.name } });
    if (!existing) { await prisma.website.create({ data: wd }); console.log(`Created website: ${wd.name} (${wd.status})`); }
  }

  console.log("Demo data seeding complete.");
  console.log(`Leads: ${createdLeads.length}, Customers: ${createdCustomers.length}, Proposals: 3, Invoices: 2, Websites: 3`);
}

main()
  .catch((e) => { console.error("Seed error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
