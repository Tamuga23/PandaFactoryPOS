import React, { useState } from 'react';
import { useStoreData } from '../hooks/useStoreData';
import { Customer } from '../types';
import { Search, Plus, Trash2, Edit, User, Phone, MapPin, Mail, Calendar } from 'lucide-react';

export default function Customers() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, loading } = useStoreData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const filteredCustomers = customers.filter(c => 
    c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => b.createdAt - a.createdAt);

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    if (confirmingDelete === id) {
      deleteCustomer(id);
      setConfirmingDelete(null);
    } else {
      setConfirmingDelete(id);
      setTimeout(() => setConfirmingDelete(null), 3000);
    }
  };

  const saveCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const customerObj = {
      fullName: formData.get('fullName') as string,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      address: formData.get('address') as string,
    };

    if (editingCustomer) {
      // Update
      await updateCustomer({
        ...editingCustomer,
        ...customerObj
      });
    } else {
      // Create new natively
      // NOTE: UUID for new ones created directly from CRM panel
      await addCustomer({
        id: crypto.randomUUID(),
        ...customerObj,
        createdAt: Date.now()
      });
    }

    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  if (loading) return <div className="text-zinc-500 p-8">Loading CRM...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 uppercase tracking-tight italic">Customers CRM</h2>
          <p className="text-xs text-zinc-500">Manage client directory, interactions and contact details.</p>
        </div>
        <div className="flex flex-col md:flex-row w-full md:w-auto gap-3">
          <div className="relative w-full md:w-64">
             <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
             <input 
              type="text" 
              placeholder="Search Name or Phone..." 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 h-10 text-sm text-zinc-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
          <button 
            onClick={handleAddNew}
            className="h-10 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap text-sm shadow-lg shadow-cyan-900/20"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map(customer => (
          <div key={customer.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-lg relative group overflow-hidden">
             
             {/* Background glow hover */}
             <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 via-cyan-500/0 to-cyan-500/5 group-hover:to-cyan-500/10 transition-colors pointer-events-none" />
             
             <div className="relative z-10 flex flex-col h-full gap-4">
                {/* Header Profile */}
                <div className="flex items-start justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-cyan-400 shrink-0">
                         <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-zinc-100 truncate text-sm leading-tight">{customer.fullName}</h3>
                        <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" /> Registered: {new Date(customer.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                   </div>
                </div>
                
                {/* Contact Data Layout */}
                <div className="space-y-2 mt-auto text-xs bg-zinc-950/40 p-3 rounded-lg border border-zinc-800/50">
                  <div className="flex items-center gap-2 text-zinc-300">
                     <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                     <span className="truncate">{customer.phone || 'No phone'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300">
                     <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                     <span className="truncate">{customer.email || 'No email'}</span>
                  </div>
                  <div className="flex items-start gap-2 text-zinc-300">
                     <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                     <span className="line-clamp-2 leading-relaxed">{customer.address || 'No location specified'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                   <button 
                     onClick={() => handleEdit(customer)} 
                     className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-md border border-zinc-700 hover:border-zinc-600 transition-colors flex justify-center items-center gap-1.5"
                   >
                     <Edit className="w-3 h-3" /> Edit Profile
                   </button>
                   <button 
                     onClick={() => handleDeleteClick(customer.id)} 
                     className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors flex justify-center items-center ${confirmingDelete === customer.id ? 'bg-rose-500/20 text-rose-500 border-rose-500/30' : 'bg-zinc-800 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500 border-zinc-700 hover:border-rose-500/30'}`}
                   >
                     {confirmingDelete === customer.id ? 'Delete?' : <Trash2 className="w-3.5 h-3.5" />}
                   </button>
                </div>
             </div>
          </div>
        ))}
        {filteredCustomers.length === 0 && (
          <div className="col-span-1 md:col-span-2 lg:col-span-3 p-20 text-center text-zinc-500 flex flex-col items-center gap-4 bg-zinc-900 border border-zinc-800 border-dashed rounded-xl">
             <User className="w-12 h-12 opacity-20" />
             <p className="italic">No customers found. Create your first client profile!</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
             <form onSubmit={saveCustomer}>
                <div className="p-6 border-b border-zinc-800">
                   <h3 className="text-xl font-bold text-zinc-100 italic flex items-center gap-2">
                      <User className="w-5 h-5 text-cyan-400" />
                      {editingCustomer ? 'Edit Customer' : 'New Customer'}
                   </h3>
                </div>
                <div className="p-6 space-y-4">
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Full Name (Required)</label>
                      <input 
                         name="fullName" 
                         required
                         defaultValue={editingCustomer?.fullName} 
                         placeholder="Jhon Doe"
                         className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:outline-none" 
                      />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <label className="text-[10px] uppercase text-zinc-500 font-bold">Contact Phone</label>
                        <input 
                           name="phone" 
                           defaultValue={editingCustomer?.phone} 
                           placeholder="8765 9876"
                           className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:outline-none" 
                        />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] uppercase text-zinc-500 font-bold">Email Address</label>
                        <input 
                           name="email" 
                           type="email"
                           defaultValue={editingCustomer?.email} 
                           placeholder="jhon@mail.com"
                           className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:outline-none" 
                        />
                     </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Physical Address / Shipping Info</label>
                      <textarea 
                         name="address" 
                         defaultValue={editingCustomer?.address} 
                         rows={3} 
                         placeholder="Barrio Santa Ana, De la iglesia 2c al sur..."
                         className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:outline-none resize-none"
                      ></textarea>
                   </div>
                </div>
                <div className="p-6 bg-zinc-800/30 flex justify-end gap-3 border-t border-zinc-800">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-sm text-zinc-400 hover:text-white font-semibold transition-colors">Cancel</button>
                   <button type="submit" className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-cyan-900/20 text-sm">Save Profile</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
