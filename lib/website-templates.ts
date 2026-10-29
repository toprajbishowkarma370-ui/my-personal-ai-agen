export type WebsiteTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  layout: string; // distinct layout class/identifier
  demoContent: any;
  theme: any;
  settings: any;
};

// 10 distinct starter website projects. Each has separate data, content, theme, settings, status.
export const WEBSITE_TEMPLATES: WebsiteTemplate[] = [
  {
    id: "local-business",
    name: "Local Business",
    category: "Local Business",
    description: "A professional online presence for local shops, trades, and services.",
    layout: "local-business",
    demoContent: {
      businessName: "Chaurjahari General Store",
      tagline: "Serving the Karnali community since 2010",
      pages: [
        { id: "home", title: "Home", sections: [{ type: "hero", title: "Welcome to Chaurjahari General Store", body: "Quality groceries and household essentials for your family." }] },
        { id: "about", title: "About", sections: [{ type: "text", title: "Our Story", body: "Locally owned and serving Chaurjahari, Karnali." }] },
        { id: "contact", title: "Contact", sections: [{ type: "contact", body: "Visit us at Bazar Road, Chaurjahari. Phone: +977 9800000000" }] },
      ],
    },
    theme: { primary: "#6957f5", accent: "#9f8efc", font: "Plus Jakarta Sans" },
    settings: { seoTitle: "Chaurjahari General Store - Local Business", seoDescription: "Quality groceries and household essentials in Chaurjahari, Karnali." },
  },
  {
    id: "hotel-restaurant",
    name: "Hotel and Restaurant",
    category: "Hospitality",
    description: "Hotel and restaurant website with menu, booking, and gallery.",
    layout: "hotel-restaurant",
    demoContent: {
      businessName: "Karnali View Hotel & Restaurant",
      tagline: "Comfortable stays and authentic local cuisine.",
      pages: [
        { id: "home", title: "Home", sections: [{ type: "hero", title: "Karnali View Hotel", body: "Comfortable rooms and authentic Nepali cuisine with mountain views." }] },
        { id: "menu", title: "Menu", sections: [{ type: "menu", title: "Our Menu", items: ["Dal Bhat Set", "Momo", "Thukpa", "Sel Roti"] }] },
        { id: "booking", title: "Booking", sections: [{ type: "booking", body: "Book your stay online. Check-in / Check-out available." }] },
      ],
    },
    theme: { primary: "#7e63f8", accent: "#bfb5fd", font: "Plus Jakarta Sans" },
    settings: { seoTitle: "Karnali View Hotel & Restaurant", seoDescription: "Comfortable stays and authentic cuisine in Chaurjahari." },
  },
  {
    id: "school-college",
    name: "School and College",
    category: "Education",
    description: "Educational institution site with courses, admissions, and events.",
    layout: "school-college",
    demoContent: {
      businessName: "Bheri Valley Public Secondary School",
      tagline: "Quality education for a brighter future.",
      pages: [
        { id: "home", title: "Home", sections: [{ type: "hero", title: "Bheri Valley Public Secondary School", body: "Nurturing young minds in Chaurjahari, Karnali." }] },
        { id: "courses", title: "Courses", sections: [{ type: "courses", title: "Programs", items: ["Science", "Management", "Education", "Humanities"] }] },
        { id: "admissions", title: "Admissions", sections: [{ type: "form", title: "Admission Enquiry", body: "Apply for the upcoming academic session." }] },
      ],
    },
    theme: { primary: "#15103b", accent: "#7e63f8", font: "Plus Jakarta Sans" },
    settings: { seoTitle: "Bheri Valley Public Secondary School", seoDescription: "Quality secondary education in Chaurjahari, Karnali." },
  },
  {
    id: "clinic-healthcare",
    name: "Clinic and Healthcare Information",
    category: "Healthcare",
    description: "Clinic site with doctor profiles, services, and appointment booking.",
    layout: "clinic-healthcare",
    demoContent: {
      businessName: "Karnali Community Clinic",
      tagline: "Caring for your health, close to home.",
      pages: [
        { id: "home", title: "Home", sections: [{ type: "hero", title: "Karnali Community Clinic", body: "Trusted healthcare for the Chaurjahari community." }] },
        { id: "services", title: "Services", sections: [{ type: "services", title: "Our Services", items: ["General Consultation", "Maternal Care", "Vaccination", "Pharmacy"] }] },
        { id: "appointment", title: "Appointment", sections: [{ type: "booking", body: "Book an appointment with our doctor." }] },
      ],
    },
    theme: { primary: "#10b981", accent: "#34d399", font: "Plus Jakarta Sans" },
    settings: { seoTitle: "Karnali Community Clinic", seoDescription: "Community healthcare in Chaurjahari, Karnali." },
  },
  {
    id: "agrovet-agriculture",
    name: "Agrovet and Agriculture Shop",
    category: "Agriculture",
    description: "Agrovet and farm supply shop with products and seasonal guidance.",
    layout: "agrovet-agriculture",
    demoContent: {
      businessName: "Karnali Agrovet & Seed Store",
      tagline: "Quality seeds, feed, and farm supplies.",
      pages: [
        { id: "home", title: "Home", sections: [{ type: "hero", title: "Karnali Agrovet", body: "Seeds, fertilizer, feed, and expert farming advice for Karnali farmers." }] },
        { id: "products", title: "Products", sections: [{ type: "products", title: "Farm Supplies", items: ["Improved Seeds", "Organic Fertilizer", "Poultry Feed", "Tools"] }] },
        { id: "tips", title: "Farming Tips", sections: [{ type: "text", title: "Seasonal Guidance", body: "Crop calendar and best practices for the Karnali region." }] },
      ],
    },
    theme: { primary: "#16a34a", accent: "#4ade80", font: "Plus Jakarta Sans" },
    settings: { seoTitle: "Karnali Agrovet & Seed Store", seoDescription: "Farm supplies and seeds in Chaurjahari, Karnali." },
  },
  {
    id: "real-estate",
    name: "Real Estate",
    category: "Real Estate",
    description: "Property listings with search, filters, and agent contact.",
    layout: "real-estate",
    demoContent: {
      businessName: "Himalayan Realty Karnali",
      tagline: "Your dream home in the hills.",
      pages: [
        { id: "home", title: "Home", sections: [{ type: "hero", title: "Himalayan Realty", body: "Properties for sale and rent across Chaurjahari and Karnali." }] },
        { id: "listings", title: "Listings", sections: [{ type: "listings", title: "Available Properties", items: ["2-BHK Family Home", "Commercial Shop", "Plot of Land"] }] },
        { id: "contact", title: "Contact Agent", sections: [{ type: "contact", body: "Contact our agent to schedule a viewing." }] },
      ],
    },
    theme: { primary: "#2563eb", accent: "#3b82f6", font: "Plus Jakarta Sans" },
    settings: { seoTitle: "Himalayan Realty Karnali", seoDescription: "Real estate in Chaurjahari, Karnali." },
  },
  {
    id: "portfolio-personal",
    name: "Portfolio and Personal Brand",
    category: "Portfolio",
    description: "Personal portfolio site to showcase work and services.",
    layout: "portfolio-personal",
    demoContent: {
      businessName: "Aasha Gurung — Designer & Developer",
      tagline: "Crafting digital experiences from Karnali.",
      pages: [
        { id: "home", title: "Home", sections: [{ type: "hero", title: "Aasha Gurung", body: "Designer & developer building solutions for local businesses." }] },
        { id: "work", title: "Work", sections: [{ type: "portfolio", title: "Selected Work", items: ["Hotel Website", "Clinic Portal", "Agrovet Shop"] }] },
        { id: "about", title: "About", sections: [{ type: "text", title: "About Me", body: "Based in Chaurjahari, serving clients across Nepal." }] },
      ],
    },
    theme: { primary: "#7e63f8", accent: "#9f8efc", font: "JetBrains Mono" },
    settings: { seoTitle: "Aasha Gurung — Portfolio", seoDescription: "Designer & developer portfolio from Chaurjahari, Karnali." },
  },
  {
    id: "agency-services",
    name: "Agency and Services",
    category: "Agency",
    description: "Service agency site with service packages, case studies, and inquiries.",
    layout: "agency-services",
    demoContent: {
      businessName: "Karnali Digital Agency",
      tagline: "Digital solutions for growing businesses.",
      pages: [
        { id: "home", title: "Home", sections: [{ type: "hero", title: "Karnali Digital Agency", body: "Web design, development, and marketing for Chaurjahari businesses." }] },
        { id: "services", title: "Services", sections: [{ type: "services", title: "Our Services", items: ["Website Design", "SEO", "Social Media", "Branding"] }] },
        { id: "inquiry", title: "Inquiry", sections: [{ type: "form", title: "Project Inquiry", body: "Tell us about your project." }] },
      ],
    },
    theme: { primary: "#4f46e5", accent: "#818cf8", font: "Plus Jakarta Sans" },
    settings: { seoTitle: "Karnali Digital Agency", seoDescription: "Digital agency serving Chaurjahari and Karnali." },
  },
  {
    id: "ecommerce-store",
    name: "E-commerce Store",
    category: "E-commerce",
    description: "Online store with product catalog, cart, and checkout.",
    layout: "ecommerce-store",
    demoContent: {
      businessName: "Karnali Mart",
      tagline: "Shop local, delivered to your door.",
      pages: [
        { id: "home", title: "Home", sections: [{ type: "hero", title: "Karnali Mart", body: "Groceries, essentials, and local products delivered across Chaurjahari." }] },
        { id: "shop", title: "Shop", sections: [{ type: "products", title: "Products", items: ["Rice", "Lentils", "Spices", "Snacks"] }] },
        { id: "cart", title: "Cart", sections: [{ type: "cart", body: "Review your order and checkout." }] },
      ],
    },
    theme: { primary: "#dc2626", accent: "#f87171", font: "Plus Jakarta Sans" },
    settings: { seoTitle: "Karnali Mart — Online Store", seoDescription: "Local groceries and essentials delivered in Chaurjahari." },
  },
  {
    id: "startup-saas",
    name: "Startup and SaaS",
    category: "Startup",
    description: "SaaS landing page with features, pricing, and signup.",
    layout: "startup-saas",
    demoContent: {
      businessName: "Karnali SaaS Platform",
      tagline: "Business management software for Nepali enterprises.",
      pages: [
        { id: "home", title: "Home", sections: [{ type: "hero", title: "Karnali SaaS", body: "Run your business smarter with cloud software built for Nepal." }] },
        { id: "features", title: "Features", sections: [{ type: "features", title: "Features", items: ["Invoicing", "Inventory", "CRM", "Reports"] }] },
        { id: "pricing", title: "Pricing", sections: [{ type: "pricing", title: "Plans", items: ["Starter", "Growth", "Enterprise"] }] },
      ],
    },
    theme: { primary: "#6366f1", accent: "#818cf8", font: "Plus Jakarta Sans" },
    settings: { seoTitle: "Karnali SaaS Platform", seoDescription: "Business management software for Nepali enterprises." },
  },
];

export function getTemplateById(id: string) {
  return WEBSITE_TEMPLATES.find((t) => t.id === id);
}

export function getAllTemplates() {
  return WEBSITE_TEMPLATES;
}
