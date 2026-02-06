import React, { useState } from "react";
import WarehouseLayout from "./WarehouseLayout";
import { RotateCcw } from "lucide-react";

export default function Home() {
  const [activeView, setActiveView] = useState("warehouse");
  const [collapsed, setCollapsed] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const handleReplay = () => {
    setResetKey(prev => prev + 1);
  };

  return (
    <>
      {/* GLOBAL STYLES */}
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          background-color: #f3f4f6;
          overflow: hidden;
        }

        .app-container {
          display: flex;
          height: 100vh;
          width: 100vw;
        }

        /* SIDEBAR */
        .sidebar {
          background-color: #0f172a;
          color: white;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          border-right: 1px solid #1e293b;
          transition: width 0.3s ease;
          width: 260px;
        }

        .sidebar.collapsed {
          width: 80px;
        }

        .sidebar-header {
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          border-bottom: 1px solid #1e293b;
        }

        .brand-text {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          letter-spacing: 0.5px;
          white-space: nowrap;
        }

        .collapse-btn {
          background: none;
          border: none;
          color: #cbd5e1;
          font-size: 18px;
          cursor: pointer;
        }

        .sidebar-nav {
          padding: 24px 16px;
          flex: 1;
        }

        .nav-label {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 700;
          margin-bottom: 12px;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .sidebar.collapsed .nav-label,
        .sidebar.collapsed .nav-text {
          display: none;
        }

        .nav-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: transparent;
          border: none;
          color: #cbd5e1;
          font-size: 14px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          margin-bottom: 6px;
          white-space: nowrap;
        }

        .nav-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: white;
        }

        .nav-btn.active {
          background: #1e40af;
          color: white;
          font-weight: 500;
          border: 1px solid #3b82f6;
        }

        .sidebar-footer {
          padding: 20px;
          border-top: 1px solid #1e293b;
          font-size: 12px;
          color: #64748b;
          text-align: center;
        }

        .sidebar.collapsed .sidebar-footer {
          display: none;
        }

        /* MAIN CONTENT */
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          background-color: #f8fafc;
        }

        .top-header {
          height: 64px;
          background: white;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 30px;
        }

        .top-header h2 {
          font-size: 18px;
          color: #0f172a;
          font-weight: 600;
          margin: 0;
        }

        .status-indicator {
          font-size: 13px;
          color: #15803d;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .dot {
          width: 8px;
          height: 8px;
          background-color: #22c55e;
          border-radius: 50%;
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }

        .replay-btn {
          margin-left: 24px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          color: #1e293b;
          font-size: 13px;
          font-weight: 700;
          height: 36px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        .replay-btn:hover {
          background: #ffffff;
          border-color: #3b82f6;
          color: #2563eb;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
        }

        .replay-btn:active {
          transform: translateY(0);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .replay-btn svg {
          width: 14px;
          height: 14px;
          transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .replay-btn:hover svg {
          transform: rotate(-360deg);
        }

        .canvas-wrapper {
          flex: 1;
          position: relative;
          background: #f1f5f9;
          overflow: hidden;
        }

        .placeholder-3d {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #64748b;
          background: radial-gradient(circle at center, #f8fafc 0%, #e2e8f0 100%);
        }
      `}</style>

      <div className="app-container">

        {/* SIDEBAR */}
        <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
          <div className="sidebar-header">
            {!collapsed && <h1 className="brand-text">FACTORY VISION</h1>}

            <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? "☰" : "⮜"}
            </button>
          </div>

          <nav className="sidebar-nav">
            <p className="nav-label">Locations</p>

            <button
              className={`nav-btn ${activeView === "warehouse" ? "active" : ""}`}
              onClick={() => setActiveView("warehouse")}
            >
              <span className="nav-text">DBR WAREHOUSE</span>
            </button>

            <button
              className={`nav-btn ${activeView === "cutting" ? "active" : ""}`}
              onClick={() => setActiveView("cutting")}
            >
              <span className="nav-text">DBR CUTTING – 1st FLOOR</span>
            </button>
          </nav>

          <div className="sidebar-footer">
            <p>v1.0 · Digital Twin Platform</p>
          </div>
        </aside>

        {/* MAIN VIEW */}
        <main className="main-content">
          <header className="top-header">
            <h2>
              {activeView === "warehouse" && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  DBR Warehouse Simulation
                  <button className="replay-btn" onClick={handleReplay}>
                    <RotateCcw />
                    Replay
                  </button>
                </div>
              )}
              {activeView === "cutting" && "DBR Cutting – 1st Floor"}
            </h2>
            <div className="status-indicator">
              <span className="dot"></span> Live System
            </div>
          </header>

          <div className="canvas-wrapper">
            {activeView === "warehouse" && <WarehouseLayout key={resetKey} />}

            {activeView === "cutting" && (
              <div className="placeholder-3d">
                <h3>DBR Cutting Floor View</h3>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
