import React, { useState, useMemo } from 'react';
import { Plus, Trash2, ShoppingCart, Calendar, Database, CheckSquare } from 'lucide-react';

// --- Initial Data / Seed Database ---
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
  {
    id: '2',
    name: 'Grilled Chicken Salad',
    ingredients: [
      { name: 'Chicken Breast', qty: 200, unit: 'g' },
      { name: 'Romaine Lettuce', qty: 0.5, unit: 'head' },
      { name: 'Cherry Tomatoes', qty: 5, unit: 'pcs' },
      { name: 'Olive Oil', qty: 1, unit: 'tbsp' }
    ]
  },
  {
    id: '3',
    name: 'Pasta Carbonara',
    ingredients: [
      { name: 'Spaghetti', qty: 150, unit: 'g' },
      { name: 'Eggs', qty: 2, unit: 'pcs' },
      { name: 'Pancetta', qty: 50, unit: 'g' },
      { name: 'Parmesan Cheese', qty: 30, unit: 'g' }
    ]
  }
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'];

export default function App() {
  const [activeTab, setActiveTab] = useState('planner');
  
  // --- State Management ---
  const [recipes, setRecipes] = useState(INITIAL_RECIPES);
  
  // Schedule: { "Monday-Breakfast": recipeId, ... }
  const [schedule, setSchedule] = useState({});
  
  // Inventory: Set of ingredient names that are "in stock"
  const [inventory, setInventory] = useState(new Set());

  // --- Aggregation Logic (The Engine) ---
  const { totalRequirements, toBuyList } = useMemo(() => {
    const totals = {};

    // 1. Iterate through schedule to aggregate raw totals
    Object.values(schedule).forEach(recipeId => {
      if (!recipeId) return;
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe) return;

      recipe.ingredients.forEach(ing => {
        const key = `${ing.name.toLowerCase()}-${ing.unit.toLowerCase()}`;
        if (!totals[key]) {
          totals[key] = { ...ing, qty: 0, rawName: ing.name }; // Keep raw name for display
        }
        totals[key].qty += parseFloat(ing.qty);
      });
    });

    const totalReqs = Object.values(totals).sort((a, b) => a.name.localeCompare(b.name));
    
    // 2. Filter for "To Buy" based on Inventory state
    const buyList = totalReqs.filter(item => !inventory.has(item.rawName));

    return { totalRequirements: totalReqs, toBuyList: buyList };
  }, [schedule, recipes, inventory]);

  // --- Handlers ---
  const toggleInventoryItem = (itemName) => {
    const newInv = new Set(inventory);
    if (newInv.has(itemName)) {
      newInv.delete(itemName);
    } else {
      newInv.add(itemName);
    }
    setInventory(newInv);
  };

  const updateSchedule = (day, type, recipeId) => {
    setSchedule(prev => ({
      ...prev,
      [`${day}-${type}`]: recipeId
    }));
  };

  const addRecipe = (newRecipe) => {
    setRecipes([...recipes, { ...newRecipe, id: Date.now().toString() }]);
  };

  const deleteRecipe = (id) => {
    setRecipes(recipes.filter(r => r.id !== id));
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-lg">
              <Database size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Relational Meal Planner</h1>
          </div>
          
          <nav className="flex gap-2 bg-slate-800 p-1 rounded-lg">
            {[
              { id: 'recipes', icon: Database, label: 'Recipes' },
              { id: 'planner', icon: Calendar, label: 'Planner' },
              { id: 'inventory', icon: CheckSquare, label: 'Inventory' },
              { id: 'shopping', icon: ShoppingCart, label: 'Shopping List' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${
                  activeTab === tab.id 
                    ? 'bg-emerald-500 text-white shadow-md' 
                    : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6">
        {activeTab === 'recipes' && <RecipeManager recipes={recipes} onAdd={addRecipe} onDelete={deleteRecipe} />}
        {activeTab === 'planner' && <WeeklyPlanner days={DAYS} types={MEAL_TYPES} recipes={recipes} schedule={schedule} onUpdate={updateSchedule} />}
        {activeTab === 'inventory' && <InventoryManager allIngredients={recipes} inventory={inventory} onToggle={toggleInventoryItem} />}
        {activeTab === 'shopping' && <ShoppingListView total={totalRequirements} buyList={toBuyList} inventory={inventory} />}
      </main>
    </div>
  );
}

// --- Sub-Components ---

function RecipeManager({ recipes, onAdd, onDelete }) {
  const [isAdding, setIsAdding] = useState(false);
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Recipe Database</h2>
          <p className="text-slate-500">Define the schema for your meals.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
        >
          {isAdding ? 'Cancel' : <><Plus size={18} /> New Recipe</>}
        </button>
      </div>

      {isAdding && <RecipeForm onSave={(r) => { onAdd(r); setIsAdding(false); }} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recipes.map(recipe => (
          <div key={recipe.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-5">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-lg text-slate-800">{recipe.name}</h3>
              <button onClick={() => onDelete(recipe.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 size={18} />
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ingredients</p>
              <ul className="text-sm text-slate-600 space-y-1">
                {recipe.ingredients.map((ing, idx) => (
                  <li key={idx} className="flex justify-between border-b border-slate-50 pb-1 last:border-0">
                    <span>{ing.name}</span>
                    <span className="font-mono text-slate-400">{ing.qty} {ing.unit}</span>
                  </li>
                ))}
              </ul>
            </div>
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
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Recipe Name</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" 
            placeholder="e.g., Avocado Toast"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Ingredients</label>
          {ingredients.map((ing, idx) => (
            <div key={idx} className="flex gap-2 mb-2">
              <input 
                placeholder="Item (e.g. Eggs)" 
                className="flex-1 p-2 border border-slate-300 rounded-md text-sm"
                value={ing.name} onChange={e => handleIngChange(idx, 'name', e.target.value)}
              />
              <input 
                placeholder="Qty" type="number"
                className="w-20 p-2 border border-slate-300 rounded-md text-sm"
                value={ing.qty} onChange={e => handleIngChange(idx, 'qty', e.target.value)}
              />
              <input 
                placeholder="Unit" 
                className="w-24 p-2 border border-slate-300 rounded-md text-sm"
                value={ing.unit} onChange={e => handleIngChange(idx, 'unit', e.target.value)}
              />
            </div>
          ))}
          <button 
            onClick={() => setIngredients([...ingredients, { name: '', qty: '', unit: '' }])}
            className="text-sm text-emerald-600 font-medium hover:underline mt-1"
          >
            + Add Another Ingredient
          </button>
        </div>

        <button onClick={save} className="bg-emerald-600 text-white px-6 py-2 rounded-md font-medium hover:bg-emerald-700 w-full sm:w-auto">
          Save Recipe
        </button>
      </div>
    </div>
  );
}

function WeeklyPlanner({ days, types, recipes, schedule, onUpdate }) {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Weekly Schedule</h2>
        <p className="text-slate-500">Map your recipes to time slots.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="p-4 bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 w-32">Day</th>
              {types.map(t => (
                <th key={t} className="p-4 bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 min-w-[200px]">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(day => (
              <tr key={day} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                <td className="p-4 font-medium text-slate-700 bg-white">{day}</td>
                {types.map(type => {
                  const key = `${day}-${type}`;
                  return (
                    <td key={key} className="p-3">
                      <select 
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer hover:border-emerald-300 transition-colors"
                        value={schedule[key] || ''}
                        onChange={(e) => onUpdate(day, type, e.target.value)}
                      >
                        <option value="">— Select Meal —</option>
                        {recipes.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryManager({ allIngredients, inventory, onToggle }) {
  const [view, setView] = useState('all'); // 'all' or 'stock'

  // Extract unique ingredients from all known recipes
  const uniqueIngredients = useMemo(() => {
    const set = new Set();
    allIngredients.forEach(r => r.ingredients.forEach(i => set.add(i.name)));
    return Array.from(set).sort();
  }, [allIngredients]);

  const displayedIngredients = useMemo(() => {
    if (view === 'stock') {
      return uniqueIngredients.filter(i => inventory.has(i));
    }
    return uniqueIngredients;
  }, [view, uniqueIngredients, inventory]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Pantry Inventory</h2>
          <p className="text-slate-500">Check what you already have to filter the shopping list.</p>
        </div>
        
        {/* Toggle Controls */}
        <div className="flex bg-slate-200 p-1 rounded-lg">
          <button 
            onClick={() => setView('all')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'all' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            All Items
          </button>
          <button 
            onClick={() => setView('stock')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'stock' ? 'bg-white shadow text-emerald-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            In Stock ({inventory.size})
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {displayedIngredients.length === 0 ? (
            <div className="col-span-full text-center py-10 text-slate-400">
              {view === 'stock' 
                ? "Your pantry is empty." 
                : "No ingredients found. Add recipes first!"}
            </div>
          ) : displayedIngredients.map(item => {
            const isChecked = inventory.has(item);
            return (
              <label key={item} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isChecked ? 'bg-emerald-50 border-emerald-200' : 'hover:bg-slate-50 border-transparent'}`}>
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`}>
                  {isChecked && <CheckSquare size={14} className="text-white" />}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={isChecked} 
                  onChange={() => onToggle(item)} 
                />
                <span className={`text-sm font-medium ${isChecked ? 'text-emerald-900' : 'text-slate-600'}`}>
                  {item}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ShoppingListView({ total, buyList, inventory }) {
  const [view, setView] = useState('buy'); // 'buy' or 'all'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Shopping List</h2>
          <p className="text-slate-500">Aggregated quantities based on your schedule.</p>
        </div>
        <div className="flex bg-slate-200 p-1 rounded-lg">
          <button 
            onClick={() => setView('buy')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'buy' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            To Buy ({buyList.length})
          </button>
          <button 
            onClick={() => setView('all')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'all' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Total Required ({total.length})
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="p-6 bg-slate-50 border-b border-slate-200">
           <h3 className="font-bold text-lg flex items-center gap-2">
             <ShoppingCart size={20} className="text-emerald-600" />
             {view === 'buy' ? 'Items to Purchase' : 'All Required Ingredients'}
           </h3>
        </div>
        
        <div className="divide-y divide-slate-100">
          {(view === 'buy' ? buyList : total).length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              {view === 'buy' 
                ? "Nothing to buy! You have everything in stock or haven't planned meals." 
                : "No meals planned yet."}
            </div>
          ) : (view === 'buy' ? buyList : total).map((item, idx) => (
            <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
              <div className="flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full ${view === 'buy' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                <span className={`font-medium ${inventory.has(item.rawName) && view === 'all' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {item.rawName}
                </span>
                {inventory.has(item.rawName) && view === 'all' && (
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">In Pantry</span>
                )}
              </div>
              <div className="font-mono text-slate-600 bg-slate-100 px-3 py-1 rounded-md text-sm">
                {item.qty} <span className="text-slate-400 text-xs">{item.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}