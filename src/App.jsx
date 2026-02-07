import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, onSnapshot, updateDoc 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  Plus, Trash2, ShoppingCart, Calendar, Database, CheckSquare, 
  LogOut, Wifi, Loader2, UserCircle
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
// I have integrated your specific keys here:
const firebaseConfig = {
  apiKey: "AIzaSyAXBaj32kPuwXmEpY9LjTq5d5h4ulRP3N4",
  authDomain: "meal-planner-sync-49152.firebaseapp.com",
  projectId: "meal-planner-sync-49152",
  storageBucket: "meal-planner-sync-49152.firebasestorage.app",
  messagingSenderId: "545999988540",
  appId: "1:545999988540:web:0cb46776eac650f2f32039"
};

// Initialize Services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- INITIAL DATA SEED ---
const INITIAL_RECIPES = [
  {
    id: '1',
    name: 'Oatmeal w/ Berries',
    ingredients: [
      { name: 'Rolled Oats', qty: 0.5, unit: 'cup' },
      { name: 'Milk', qty: 1, unit: 'cup' },
      { name: 'Blueberries', qty: 0.25, unit: 'cup' },
      { name: 'Honey', qty: 1, unit: 'tbsp' }
    ]
  },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-emerald-600" /></div>;

  return user ? <AuthenticatedApp user={user} /> : <AnonymousAuthScreen />;
}

// --- AUTH COMPONENT (ANONYMOUS) ---
function AnonymousAuthScreen() {
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleAuth = async () => {
    setIsSigningIn(true);
    setError('');
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.error(err);
      setError('Could not start session. Check console.');
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md text-center">
        <Database className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Smart Meal Sync</h1>
        <p className="text-slate-500 mb-8">Plan meals across devices instantly.</p>
        
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}
        
        <button 
          onClick={handleAuth} 
          disabled={isSigningIn}
          className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition flex items-center justify-center gap-2"
        >
          {isSigningIn ? <Loader2 className="animate-spin" /> : 'Start Planning'}
        </button>
        <p className="text-xs text-slate-400 mt-4">
          Session persists on this device automatically.
        </p>
      </div>
    </div>
  );
}

// --- MAIN APP (Only renders when authenticated) ---
function AuthenticatedApp({ user }) {
  const [activeTab, setActiveTab] = useState('planner');
  const [syncStatus, setSyncStatus] = useState('syncing'); 

  // Local state mirrors
  const [recipes, setRecipes] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [inventory, setInventory] = useState(new Set());

  // --- FIRESTORE SYNC ENGINE ---
  useEffect(() => {
    const docRef = doc(db, 'users', user.uid, 'planner', 'data');

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRecipes(data.recipes || []);
        setSchedule(data.schedule || {});
        setInventory(new Set(data.inventory || []));
        setSyncStatus('synced');
      } else {
        // First time user: Create default doc
        setDoc(docRef, {
          recipes: INITIAL_RECIPES,
          schedule: {},
          inventory: []
        });
      }
    }, (error) => {
      console.error("Sync Error:", error);
      setSyncStatus('error');
    });

    return () => unsubscribe();
  }, [user.uid]);

  // --- WRITERS (Push to Cloud) ---
  const pushUpdate = async (field, newData) => {
    setSyncStatus('syncing');
    const docRef = doc(db, 'users', user.uid, 'planner', 'data');
    try {
      await updateDoc(docRef, { [field]: newData });
      setSyncStatus('synced');
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
    }
  };

  // --- AGGREGATION LOGIC ---
  const { totalRequirements, toBuyList } = useMemo(() => {
    const totals = {};
    Object.values(schedule).forEach(recipeId => {
      if (!recipeId) return;
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe) return;
      recipe.ingredients.forEach(ing => {
        const key = `${ing.name.toLowerCase()}-${ing.unit.toLowerCase()}`;
        if (!totals[key]) {
          totals[key] = { ...ing, qty: 0, rawName: ing.name };
        }
        totals[key].qty += parseFloat(ing.qty);
      });
    });
    const totalReqs = Object.values(totals).sort((a, b) => a.name.localeCompare(b.name));
    return { 
      totalRequirements: totalReqs, 
      toBuyList: totalReqs.filter(item => !inventory.has(item.rawName)) 
    };
  }, [schedule, recipes, inventory]);

  // --- HANDLERS ---
  const handleInventory = (item) => {
    const newInv = new Set(inventory);
    if (newInv.has(item)) newInv.delete(item);
    else newInv.add(item);
    setInventory(newInv); 
    pushUpdate('inventory', Array.from(newInv));
  };

  const handleSchedule = (day, type, rId) => {
    const newSched = { ...schedule, [`${day}-${type}`]: rId };
    setSchedule(newSched);
    pushUpdate('schedule', newSched);
  };

  const handleAddRecipe = (newRecipe) => {
    const updatedRecipes = [...recipes, { ...newRecipe, id: Date.now().toString() }];
    setRecipes(updatedRecipes);
    pushUpdate('recipes', updatedRecipes);
  };

  const handleDeleteRecipe = (id) => {
    const updatedRecipes = recipes.filter(r => r.id !== id);
    setRecipes(updatedRecipes);
    pushUpdate('recipes', updatedRecipes);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 md:pb-0">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg transition-colors ${syncStatus === 'synced' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
              {syncStatus === 'synced' ? <Wifi size={24} /> : <Loader2 size={24} className="animate-spin" />}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Smart Meal Sync</h1>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <UserCircle size={12} />
                <span className="font-mono">ID: {user.uid.slice(0,6)}...</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
             <nav className="flex gap-1 bg-slate-800 p-1 rounded-lg">
              {[
                { id: 'recipes', icon: Database, label: 'Recipes' },
                { id: 'planner', icon: Calendar, label: 'Plan' },
                { id: 'inventory', icon: CheckSquare, label: 'Stock' },
                { id: 'shopping', icon: ShoppingCart, label: 'Shop' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all text-sm font-medium ${
                    activeTab === tab.id 
                      ? 'bg-emerald-500 text-white shadow-md' 
                      : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <tab.icon size={16} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
            <button onClick={() => signOut(auth)} className="bg-slate-700 p-2 rounded-lg hover:bg-red-600 transition-colors" title="Sign Out">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6">
        {activeTab === 'recipes' && <RecipeManager recipes={recipes} onAdd={handleAddRecipe} onDelete={handleDeleteRecipe} />}
        {activeTab === 'planner' && <WeeklyPlanner days={DAYS} types={MEAL_TYPES} recipes={recipes} schedule={schedule} onUpdate={handleSchedule} />}
        {activeTab === 'inventory' && <InventoryManager allIngredients={recipes} inventory={inventory} onToggle={handleInventory} />}
        {activeTab === 'shopping' && <ShoppingListView total={totalRequirements} buyList={toBuyList} inventory={inventory} />}
      </main>
    </div>
  );
}

// --- Sub-Components (Unchanged logic, just re-declaring for self-containment) ---

function RecipeManager({ recipes, onAdd, onDelete }) {
  const [isAdding, setIsAdding] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Recipe Database</h2>
        <button onClick={() => setIsAdding(!isAdding)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm">
          {isAdding ? 'Cancel' : <><Plus size={18} /> New Recipe</>}
        </button>
      </div>
      {isAdding && <RecipeForm onSave={(r) => { onAdd(r); setIsAdding(false); }} />}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recipes.map(recipe => (
          <div key={recipe.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-lg text-slate-800">{recipe.name}</h3>
              <button onClick={() => onDelete(recipe.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={18} /></button>
            </div>
            <ul className="text-sm text-slate-600 space-y-1">
              {recipe.ingredients.map((ing, idx) => (
                <li key={idx} className="flex justify-between border-b border-slate-50 pb-1">
                  <span>{ing.name}</span><span className="font-mono text-slate-400">{ing.qty} {ing.unit}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipeForm({ onSave }) {
  const [name, setName] = useState('');
  const [ingredients, setIngredients] = useState([{ name: '', qty: '', unit: '' }]);
  const handleIngChange = (idx, field, val) => {
    const newIngs = [...ingredients];
    newIngs[idx][field] = val;
    setIngredients(newIngs);
  };
  const save = () => {
    if (!name) return;
    const validIngs = ingredients.filter(i => i.name && i.qty);
    onSave({ name, ingredients: validIngs });
  };
  return (
    <div className="bg-slate-50 border-2 border-dashed border-emerald-200 rounded-xl p-6 mb-8">
      <h3 className="font-bold text-lg mb-4 text-emerald-800">New Recipe Entry</h3>
      <div className="space-y-4">
        <input value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded-md" placeholder="Recipe Name" />
        {ingredients.map((ing, idx) => (
          <div key={idx} className="flex gap-2">
            <input placeholder="Item" className="flex-1 p-2 border rounded-md" value={ing.name} onChange={e => handleIngChange(idx, 'name', e.target.value)} />
            <input placeholder="Qty" type="number" className="w-20 p-2 border rounded-md" value={ing.qty} onChange={e => handleIngChange(idx, 'qty', e.target.value)} />
            <input placeholder="Unit" className="w-24 p-2 border rounded-md" value={ing.unit} onChange={e => handleIngChange(idx, 'unit', e.target.value)} />
          </div>
        ))}
        <div className="flex gap-2">
            <button onClick={() => setIngredients([...ingredients, { name: '', qty: '', unit: '' }])} className="text-sm text-emerald-600">+ Add Ingredient</button>
            <button onClick={save} className="bg-emerald-600 text-white px-6 py-2 rounded-md ml-auto">Save Recipe</button>
        </div>
      </div>
    </div>
  );
}

function WeeklyPlanner({ days, types, recipes, schedule, onUpdate }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Weekly Schedule</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="p-4 bg-slate-50 border-b w-32">Day</th>
              {types.map(t => <th key={t} className="p-4 bg-slate-50 border-b min-w-[200px]">{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {days.map(day => (
              <tr key={day} className="border-b last:border-0 hover:bg-slate-50">
                <td className="p-4 font-medium">{day}</td>
                {types.map(type => (
                  <td key={`${day}-${type}`} className="p-3">
                    <select 
                      className="w-full p-2 bg-slate-50 border rounded-lg text-sm"
                      value={schedule[`${day}-${type}`] || ''}
                      onChange={(e) => onUpdate(day, type, e.target.value)}
                    >
                      <option value="">— Select —</option>
                      {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryManager({ allIngredients, inventory, onToggle }) {
  const [view, setView] = useState('all');
  const uniqueIngredients = useMemo(() => {
    const set = new Set();
    allIngredients.forEach(r => r.ingredients.forEach(i => set.add(i.name)));
    return Array.from(set).sort();
  }, [allIngredients]);
  
  const displayed = view === 'stock' ? uniqueIngredients.filter(i => inventory.has(i)) : uniqueIngredients;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Pantry Inventory</h2>
        <div className="flex bg-slate-200 p-1 rounded-lg">
          <button onClick={() => setView('all')} className={`px-4 py-1.5 rounded-md text-sm ${view === 'all' ? 'bg-white shadow' : ''}`}>All</button>
          <button onClick={() => setView('stock')} className={`px-4 py-1.5 rounded-md text-sm ${view === 'stock' ? 'bg-white shadow' : ''}`}>Stock ({inventory.size})</button>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border p-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {displayed.map(item => (
          <label key={item} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${inventory.has(item) ? 'bg-emerald-50 border-emerald-200' : ''}`}>
            <div className={`w-5 h-5 rounded border flex items-center justify-center ${inventory.has(item) ? 'bg-emerald-500 border-emerald-500' : 'bg-white'}`}>
              {inventory.has(item) && <CheckSquare size={14} className="text-white" />}
            </div>
            <input type="checkbox" className="hidden" checked={inventory.has(item)} onChange={() => onToggle(item)} />
            <span className="text-sm font-medium">{item}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ShoppingListView({ total, buyList, inventory }) {
  const [view, setView] = useState('buy');
  const items = view === 'buy' ? buyList : total;
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Shopping List</h2>
        <div className="flex bg-slate-200 p-1 rounded-lg">
          <button onClick={() => setView('buy')} className={`px-4 py-1.5 rounded-md text-sm ${view === 'buy' ? 'bg-white shadow' : ''}`}>To Buy ({buyList.length})</button>
          <button onClick={() => setView('all')} className={`px-4 py-1.5 rounded-md text-sm ${view === 'all' ? 'bg-white shadow' : ''}`}>Total ({total.length})</button>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-lg border overflow-hidden divide-y">
        {items.length === 0 ? <div className="p-12 text-center text-slate-400">Nothing here!</div> : items.map((item, idx) => (
          <div key={idx} className="p-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className={`w-2 h-2 rounded-full ${view === 'buy' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className={inventory.has(item.rawName) && view === 'all' ? 'line-through text-slate-400' : ''}>{item.rawName}</span>
            </div>
            <div className="font-mono bg-slate-100 px-3 py-1 rounded text-sm">{item.qty} {item.unit}</div>
          </div>
        ))}
      </div>
    </div>
  );
}