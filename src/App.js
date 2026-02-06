import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.js";
import WarehouseLayout from "./pages/WarehouseLayout.js";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/warehouse" element={<WarehouseLayout />} />
      </Routes>
    </BrowserRouter>
  );
}




