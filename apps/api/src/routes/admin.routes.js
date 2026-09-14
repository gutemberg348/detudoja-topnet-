import { Router } from "express";
import { adminAuthRoutes } from "./admin-auth.routes.js";
import { adminAdministratorsRoutes } from "./admin-administrators.routes.js";
import { adminBonusRoutes } from "./admin-bonus.routes.js";
import { adminCategoriesRoutes } from "./admin-categories.routes.js";
import { adminDashboardRoutes } from "./admin-dashboard.routes.js";
import { adminFiscalRoutes } from "./admin-fiscal.routes.js";
import { adminFraudRoutes } from "./admin-fraud.routes.js";
import { adminKycRoutes } from "./admin-kyc.routes.js";
import { adminLedgerRoutes } from "./admin-ledger.routes.js";
import { adminMerchantsRoutes } from "./admin-merchants.routes.js";
import { adminNetworkRoutes } from "./admin-network.routes.js";
import { adminPaymentsRoutes } from "./admin-payments.routes.js";
import { adminSegmentsRoutes } from "./admin-segments.routes.js";
import { adminServiceTypesRoutes } from "./admin-service-types.routes.js";
import { adminSettingsRoutes } from "./admin-settings.routes.js";
import { adminUsersRoutes } from "./admin-users.routes.js";
import { adminWalletRoutes } from "./admin-wallet.routes.js";
import { adminWithdrawalsRoutes } from "./admin-withdrawals.routes.js";
import { adminAuthMiddleware } from "../middlewares/admin-auth.middleware.js";
import { roleMiddleware } from "../middlewares/role.middleware.js";

export const adminRoutes = Router();

adminRoutes.use("/auth", adminAuthRoutes);
adminRoutes.use(adminAuthMiddleware);

const anyActiveAdmin = ["super_admin", "admin", "operacoes", "suporte", "financeiro", "compliance", "kyc"];
const operationsRoles = ["super_admin", "admin", "operacoes"];
const financialRoles = ["super_admin", "admin", "financeiro"];
const complianceRoles = ["super_admin", "admin", "compliance", "kyc"];

adminRoutes.use("/dashboard", roleMiddleware(...anyActiveAdmin), adminDashboardRoutes);
adminRoutes.use("/administrators", roleMiddleware("super_admin"), adminAdministratorsRoutes);
adminRoutes.use("/users", roleMiddleware(...operationsRoles, "financeiro", "compliance", "kyc"), adminUsersRoutes);
adminRoutes.use("/categories", roleMiddleware(...operationsRoles), adminCategoriesRoutes);
adminRoutes.use("/segments", roleMiddleware(...operationsRoles), adminSegmentsRoutes);
adminRoutes.use("/service-types", roleMiddleware(...operationsRoles), adminServiceTypesRoutes);
adminRoutes.use("/kyc", roleMiddleware(...complianceRoles), adminKycRoutes);
adminRoutes.use("/merchants", roleMiddleware(...operationsRoles), adminMerchantsRoutes);
adminRoutes.use("/payments", roleMiddleware(...financialRoles), adminPaymentsRoutes);
adminRoutes.use("/wallet", roleMiddleware(...financialRoles), adminWalletRoutes);
adminRoutes.use("/ledger", roleMiddleware(...financialRoles), adminLedgerRoutes);
adminRoutes.use("/withdrawals", roleMiddleware(...financialRoles), adminWithdrawalsRoutes);
adminRoutes.use("/network", roleMiddleware(...operationsRoles), adminNetworkRoutes);
adminRoutes.use("/bonus", roleMiddleware(...financialRoles), adminBonusRoutes);
adminRoutes.use("/fraud", roleMiddleware("super_admin", "admin", "compliance"), adminFraudRoutes);
adminRoutes.use("/fiscal", roleMiddleware(...financialRoles), adminFiscalRoutes);
adminRoutes.use("/settings", roleMiddleware("super_admin", "admin", "financeiro", "suporte"), adminSettingsRoutes);
