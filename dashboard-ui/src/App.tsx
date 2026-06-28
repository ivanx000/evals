import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Overview } from "./pages/Overview";
import { RunDetail } from "./pages/RunDetail";
import { Compare } from "./pages/Compare";
import { Benchmarks } from "./pages/Benchmarks";

function Nav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm transition-colors px-1 py-0.5 border-b-2 ${
      isActive
        ? "text-gray-100 border-blue-400"
        : "text-gray-500 border-transparent hover:text-gray-300"
    }`;
  return (
    <nav className="bg-gray-900 border-b border-gray-700 px-6 py-3 flex items-center gap-6">
      <span className="text-gray-400 text-sm font-semibold mr-2 select-none">eval</span>
      <NavLink to="/" end className={linkClass}>Overview</NavLink>
      <NavLink to="/compare" className={linkClass}>Compare</NavLink>
      <NavLink to="/benchmarks" className={linkClass}>Benchmarks</NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900 text-gray-100">
        <Nav />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/runs/:id" element={<RunDetail />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/benchmarks" element={<Benchmarks />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
