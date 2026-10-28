'use client';

import React, { useState } from 'react';

export default function AjisaAgrovetDemoPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [inquiryProduct, setInquiryProduct] = useState('');
  const [farmerPhone, setFarmerPhone] = useState('');
  const [farmerMessage, setFarmerMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const products = [
    { id: 1, name: 'उन्नत धानको बीउ (Hybrid Paddy Seed)', category: 'seeds', stock: 'उपलब्ध (Available: 45 बोरा)', price: 'रु. २,४०० / बोरा' },
    { id: 2, name: 'हाइब्रिड मकै बीउ (Hybrid Maize Seed)', category: 'seeds', stock: 'उपलब्ध (Available: 30 बोरा)', price: 'रु. १,८०० / बोरा' },
    { id: 3, name: 'युरिया मल (Urea Fertilizer 50kg)', category: 'fertilizers', stock: 'स्टक सीमित (Limited: 12 बोरा)', price: 'रु. १,१५० / बोरा' },
    { id: 4, name: 'डिएपी मल (DAP Fertilizer 50kg)', category: 'fertilizers', stock: 'उपलब्ध (Available: 20 बोरा)', price: 'रु. २,९०० / बोरा' },
    { id: 5, name: 'गाईभैंसीको दाउरा/पशु आहारा (Cattle Feed 50kg)', category: 'feed', stock: 'उपलब्ध (Available: 60 बोरा)', price: 'रु. २,२०० / बोरा' },
    { id: 6, name: 'भेटेरिनरी मिनरल मिक्सचर (Mineral Mixture 1kg)', category: 'medicines', stock: 'उपलब्ध (Available: 85 प्याकेट)', price: 'रु. ३५० / प्याकेट' },
  ];

  const filteredProducts = selectedCategory === 'all' 
    ? products 
    : products.filter(p => p.category === selectedCategory);

  const handleInquiry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmerPhone) return alert('कृपया सम्पर्क फोन नम्बर प्रविष्ट गर्नुहोस्।');
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Demo Banner */}
      <div className="bg-amber-500 text-slate-950 px-4 py-2 text-center text-xs font-black uppercase tracking-wider sticky top-0 z-50 shadow-md">
        ⚠️ DEMO PREVIEW: Sample catalog for Ajisa Agrovet Suppliers, Chaurjahari • Real inventory & contact pending owner verification
      </div>

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-6 text-center">
        <div className="max-w-2xl mx-auto space-y-2">
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-[11px] font-bold border border-emerald-500/30">
            🌱 अधिकृत कृषि सामग्री तथा बीउ-विजन केन्द्र
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white">अजिसा एग्रोभेट सप्लाईज</h1>
          <p className="text-xs sm:text-sm text-slate-400">मुख्य बजार, चौरजहारी, रुकुम पश्चिम, कर्णाली प्रदेश</p>
          <div className="pt-2 flex flex-wrap justify-center gap-3 text-xs">
            <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded-lg border border-slate-700">
              📞 सम्पर्क: [Verified WhatsApp/Phone pending owner consent]
            </span>
            <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded-lg border border-slate-700">
              ⏰ खुला समय: बिहान ७:०० देखि साँझ ७:००
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Categories */}
        <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-none">
          {[
            { id: 'all', label: 'सबै सामग्री (All)' },
            { id: 'seeds', label: '🌾 बीउ-विजन (Seeds)' },
            { id: 'fertilizers', label: '🧪 मलखाद (Fertilizers)' },
            { id: 'feed', label: '🐄 पशु आहारा (Feed)' },
            { id: 'medicines', label: '💊 भेटेरिनरी (Medicines)' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-300 flex items-center justify-between">
            <span>उपलब्ध कृषि सामग्री तथा स्टक सूची</span>
            <span className="text-xs font-mono text-emerald-400">Live Sample Data</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredProducts.map(p => (
              <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-emerald-500/40 transition">
                <div className="space-y-1">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">{p.category}</span>
                    <span className="text-xs font-extrabold text-emerald-400">{p.price}</span>
                  </div>
                  <h3 className="font-bold text-sm text-white">{p.name}</h3>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-800/80 text-xs">
                  <span className="text-amber-300 font-medium">{p.stock}</span>
                  <button
                    onClick={() => {
                      setInquiryProduct(p.name);
                      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-[11px] transition"
                  >
                    स्टक सोधपुछ (Inquire)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock Inquiry Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>💬 पसलमा स्टक जाँच तथा सोधपुछ फारम</span>
            </h2>
            <p className="text-xs text-slate-400">
              कृषक दाजुभाइ तथा दिदीबहिनीहरूले आवश्यक मल, बीउ वा औषधिको उपलब्धता बारे यहाँ सोधपुछ पठाउन सक्नुहुन्छ।
            </p>
          </div>

          {submitted ? (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center space-y-2">
              <div className="font-bold text-emerald-300 text-sm">सोधपुछ सफलतापूर्वक रेकर्ड भयो!</div>
              <p className="text-xs text-slate-300">अजिसा एग्रोभेटको डेमो सिस्टममा तपाईंको सन्देश सुरक्षित गरिएको छ। पसल सञ्चालकको पुष्टिपछि उहाँहरूले फोन वा ह्वाट्सएपमार्फत सम्पर्क गर्नुहुनेछ।</p>
              <button
                onClick={() => setSubmitted(false)}
                className="mt-2 px-3 py-1 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700"
              >
                अर्को सोधपुछ पठाउनुहोस्
              </button>
            </div>
          ) : (
            <form onSubmit={handleInquiry} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">छनौट गरिएको सामग्री (Selected Product)</label>
                <input
                  type="text"
                  value={inquiryProduct}
                  onChange={(e) => setInquiryProduct(e.target.value)}
                  placeholder="उदा. युरिया मल / धानको बीउ"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">तपाईंको फोन नम्बर (Phone Number) *</label>
                <input
                  type="tel"
                  required
                  value={farmerPhone}
                  onChange={(e) => setFarmerPhone(e.target.value)}
                  placeholder="उदा. ९८XXXXXXXX"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">थप सन्देश वा मात्रा (Message / Quantity)</label>
                <textarea
                  rows={3}
                  value={farmerMessage}
                  onChange={(e) => setFarmerMessage(e.target.value)}
                  placeholder="कति बोरा वा कति परिमाण आवश्यक छ लेख्नुहोस्..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/25"
              >
                सोधपुछ पठाउनुहोस् (Send Stock Inquiry)
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto px-4 pt-8 text-center text-xs text-slate-500 space-y-1">
        <p>Powered by My Personal AI Business Agent • Autonomous Business OS v3.8</p>
        <p className="text-[10px]">Demo Preview for Ajisa Agrovet Suppliers, Chaurjahari, Rukum West, Nepal.</p>
      </footer>
    </div>
  );
}
