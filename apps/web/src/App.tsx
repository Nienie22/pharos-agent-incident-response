import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/AppLayout.js";
import { HomePage } from "./pages/HomePage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { IncidentsListPage } from "./pages/IncidentsListPage.js";
import { IncidentDetailPage } from "./pages/IncidentDetailPage.js";
import { DemoScenariosPage } from "./pages/DemoScenariosPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { ClientProvider } from "./lib/ClientContext.js";
import { WalletProvider } from "./lib/WalletContext.js";

export function App() {
  return (
    <ClientProvider>
      <WalletProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="incidents" element={<IncidentsListPage />} />
              <Route path="incidents/:id" element={<IncidentDetailPage />} />
              <Route path="demo" element={<DemoScenariosPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </ClientProvider>
  );
}
