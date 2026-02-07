import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, onSnapshot, updateDoc 
} from 'firebase/firestore';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  Plus, Trash2, ShoppingCart, Calendar, Database, CheckSquare, 
  LogOut, Wifi, Loader2, UserCircle, Minus, X
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
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

  return user ? <AuthenticatedApp user={user} /> : <AuthScreen />;
}

// --- AUTH COMPONENT (EMAIL/PASSWORD) ---
function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md text-center">
        <Database className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Smart Meal Sync</h1>
        <p className="text-slate-500 mb-8">{isLogin ? 'Sign in to sync across devices' : 'Create an account to get started'}</p>
        
        <form onSubmit={handleAuth} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-left">{error}</div>}
          <input 
            type="email" placeholder="Email" required 
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            value={email} onChange={e => setEmail(e.target.value)}
          />
          <input 
            type="password" placeholder="Password" required 
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            value={password} onChange={e => setPassword(e.target.value)}
          />
          <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition">
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        
        <button 
          onClick={() => setIsLogin(!isLogin)} 
          className="w-full mt-4 text-slate-500 text-sm hover:text-emerald-600"
        >
          {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

// --- MAIN APP ---
function AuthenticatedApp({ user }) {
  const [activeTab, setActiveTab] = useState('planner');
  const [syncStatus, setSyncStatus] = useState('syncing'); 

  // Data State
  const [recipes, setRecipes] = useState([]);
  const [schedule, setSchedule] = useState({});
  // Inventory is now a map: { "Oats": 5, "Milk": 1 }
  const [inventory, setInventory] = useState({});

  // --- FIRESTORE SYNC ENGINE ---
  useEffect(() => {
    const docRef = doc(db, 'users', user.uid, 'planner', 'data');

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRecipes(data.recipes || []);
        setSchedule(data.schedule || {});
        
        // MIGRATION LOGIC: Convert old array inventory to object if needed
        let loadedInv = data.inventory || {};
        if (Array.isArray(loadedInv)) {
          loadedInv = loadedInv.reduce((acc, item) => ({ ...acc, [item]: 1 }), {});
        }
        setInventory(loadedInv);
        
        setSyncStatus('synced');
      } else {
        setDoc(docRef, {
          recipes: INITIAL_RECIPES,
          schedule: {},
          inventory: {}
        });
      }
    }, (error) => {
      console.error("Sync Error:", error);
      setSyncStatus('error');
    });

    return () => unsubscribe();
  }, [user.uid]);

  // --- WRITERS ---
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

  // --- AGGREGATION LOGIC (Smart Shopping List) ---
  const { totalRequirements, toBuyList } = useMemo(() => {
    const totals = {};
    
    // 1. Aggregate Needs
    Object.values(schedule).forEach(recipeId => {
      if (!recipeId) return;
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe) return;
      
      recipe.ingredients.forEach(ing => {
        const key = `${ing.name.toLowerCase()}-${ing.unit.toLowerCase()}`;
        if (!totals[key]) {
          totals[key] = { 
            ...ing, 
            qty: 0, 
            rawName: ing.name,
            usedIn: new Set() // Track usage
          };
        }
        totals[key].qty += parseFloat(ing.qty);
        totals[key].usedIn.add(recipe.name);
      });
    });

    const totalReqs = Object.values(totals)
      .map(item => ({ ...item, usedIn: Array.from(item.usedIn) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 2. Calculate "To Buy" (Need - Have)
    // We treat inventory names as case-insensitive matches
    const buyList = totalReqs.map(req => {
      const stockQty = inventory[req.rawName] || 0;
      const needQty = req.qty;
      const buyQty = Math.max(0, needQty - stockQty);
      return { ...req, buyQty, stockQty };
    }).filter(item => item.buyQty > 0);

    return { totalRequirements: totalReqs, toBuyList: buyList };
  }, [schedule, recipes, inventory]);

  // --- HANDLERS ---
  const handleInventory = (item, value, isAbsolute = false) => {
    const currentQty = inventory[item] || 0;
    
    let newQty;
    if (isAbsolute) {
        newQty = Math.max(0, value); // Direct set (typing)
    } else {
        newQty = Math.max(0, currentQty + value); // Delta (+/- buttons)
    }
    
    const newInv = { ...inventory };
    if (newQty > 0) {
      newInv[item] = newQty;
    } else {
      delete newInv[item];
    }
    
    setInventory(newInv);
    pushUpdate('inventory', newInv);
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
                <span className="font-mono">User: {user.email || 'Guest'}</span>
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
        {activeTab === 'inventory' && <InventoryManager allIngredients={recipes} inventory={inventory} onUpdate={handleInventory} />}
        {activeTab === 'shopping' && <ShoppingListView total={totalRequirements} buyList={toBuyList} />}
      </main>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function RecipeManager({ recipes, onAdd, onDelete }) {
  const [isAdding, setIsAdding] = useState(false);
  
  // Extract all known ingredients for autocomplete
  const knownIngredients = useMemo(() => {
    const set = new Set();
    recipes.forEach(r => r.ingredients.forEach(i => set.add(i.name)));
    return Array.from(set).sort();
  }, [recipes]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Recipe Database</h2>
        <button onClick={() => setIsAdding(!isAdding)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm">
          {isAdding ? 'Cancel' : <><Plus size={18} /> New Recipe</>}
        </button>
      </div>
      {isAdding && <RecipeForm knownIngredients={knownIngredients} onSave={(r) => { onAdd(r); setIsAdding(false); }} />}
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

function RecipeForm({ onSave, knownIngredients }) {
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
        
        {/* Datalist for Autocomplete */}
        <datalist id="known-ingredients">
          {knownIngredients.map(ing => <option key={ing} value={ing} />)}
        </datalist>

        {ingredients.map((ing, idx) => (
          <div key={idx} className="flex gap-2">
            <input 
              placeholder="Item (e.g. Eggs)" 
              className="flex-1 p-2 border rounded-md" 
              value={ing.name} 
              list="known-ingredients" // Link input to datalist
              onChange={e => handleIngChange(idx, 'name', e.target.value)} 
            />
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

function InventoryManager({ allIngredients, inventory, onUpdate }) {
  const [view, setView] = useState('all');
  const [isAdding, setIsAdding] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  
  // Create a Map of Ingredient Name -> Unit
  const ingredientMeta = useMemo(() => {
    const map = {};
    allIngredients.forEach(r => r.ingredients.forEach(i => {
      // Store unit for this ingredient
      if (!map[i.name]) map[i.name] = i.unit;
    }));
    return map;
  }, [allIngredients]);
  
  // Merge Recipe Ingredients + Current Inventory Items for the "Database" list
  const uniqueIngredients = useMemo(() => {
    const fromRecipes = Object.keys(ingredientMeta);
    const fromInventory = Object.keys(inventory);
    return Array.from(new Set([...fromRecipes, ...fromInventory])).sort();
  }, [ingredientMeta, inventory]);
  
  // Determine displayed list
  const displayed = useMemo(() => {
    if (view === 'stock') {
      return uniqueIngredients.filter(i => (inventory[i] || 0) > 0);
    }
    return uniqueIngredients;
  }, [view, uniqueIngredients, inventory]);

  const inStockCount = uniqueIngredients.filter(i => (inventory[i] || 0) > 0).length;

  const handleManualAdd = () => {
    if (!newItemName) return;
    onUpdate(newItemName, parseFloat(newItemQty) || 0, true);
    setNewItemName('');
    setNewItemQty(1);
    setIsAdding(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Pantry Inventory</h2>
          <p className="text-slate-500 text-sm">Manage what you have in stock.</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-slate-200 p-1 rounded-lg">
            <button onClick={() => setView('all')} className={`px-4 py-1.5 rounded-md text-sm ${view === 'all' ? 'bg-white shadow' : ''}`}>All</button>
            <button onClick={() => setView('stock')} className={`px-4 py-1.5 rounded-md text-sm ${view === 'stock' ? 'bg-white shadow' : ''}`}>Stock ({inStockCount})</button>
          </div>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 transition shadow-sm"
            title="Add new item"
          >
            {isAdding ? <X size={20} /> : <Plus size={20} />}
          </button>
        </div>
      </div>

      {/* Add Item Form */}
      {isAdding && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-6 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-semibold text-emerald-800 mb-1">ITEM NAME</label>
            <input 
              className="w-full p-2 border border-emerald-200 rounded-md text-sm" 
              placeholder="e.g. Rice" 
              list="inventory-known-ingredients"
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
            />
            <datalist id="inventory-known-ingredients">
              {uniqueIngredients.map(ing => <option key={ing} value={ing} />)}
            </datalist>
          </div>
          <div className="w-24">
            <label className="block text-xs font-semibold text-emerald-800 mb-1">QTY</label>
            <input 
              type="number" 
              className="w-full p-2 border border-emerald-200 rounded-md text-sm" 
              placeholder="1" 
              value={newItemQty}
              onChange={e => setNewItemQty(e.target.value)}
            />
          </div>
          <button 
            onClick={handleManualAdd}
            className="w-full sm:w-auto bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-emerald-700"
          >
            Add
          </button>
        </div>
      )}

      {/* Inventory List */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        {displayed.length === 0 ? <div className="text-center p-8 text-slate-400">No ingredients found.</div> : (
          <div className="divide-y">
            {displayed.map(item => {
              const qty = inventory[item] || 0;
              const unit = ingredientMeta[item] || ''; // Retrieve unit if known
              return (
                <div key={item} className={`flex items-center justify-between p-3 ${qty > 0 ? 'bg-emerald-50/50' : ''}`}>
                  <span className={`font-medium ${qty > 0 ? 'text-emerald-900' : 'text-slate-600'}`}>{item}</span>
                  
                  <div className="flex items-center gap-2 bg-white border rounded-lg p-1 shadow-sm">
                    <button 
                      onClick={() => onUpdate(item, -1)}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500"
                    >
                      <Minus size={16} />
                    </button>
                    {/* INPUT FIELD FOR QUANTITY */}
                    <div className="flex items-center">
                      <input 
                        type="number"
                        className="w-16 text-center font-mono text-sm font-bold text-slate-700 outline-none bg-transparent"
                        value={qty}
                        onChange={(e) => onUpdate(item, parseFloat(e.target.value) || 0, true)} // True = Absolute set
                      />
                      <span className="text-xs font-normal text-slate-400 pr-2 min-w-[20px]">{unit}</span>
                    </div>
                    <button 
                      onClick={() => onUpdate(item, 1)}
                      className="p-1 hover:bg-slate-100 rounded text-emerald-600"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ShoppingListView({ total, buyList }) {
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
          <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${view === 'buy' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div>
                <div className="font-medium text-slate-800">{item.rawName}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.usedIn.map(r => (
                    <span key={r} className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 self-end sm:self-auto">
               {view === 'buy' && item.stockQty > 0 && (
                 <div className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded">
                   Have: {item.stockQty} {item.unit}
                 </div>
               )}
               <div className="font-mono bg-slate-100 px-3 py-1 rounded text-sm min-w-[80px] text-center">
                 {view === 'buy' ? item.buyQty : item.qty} {item.unit}
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}