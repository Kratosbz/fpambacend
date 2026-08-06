'use strict';
// ── FORM REQUEST MODEL ────────────────────────────────────────────────────────
// One collection for all 15 FPAM compliance forms. Each document holds the
// common submission/review envelope PLUS exactly one populated form-specific
// data block (matched by `formType`), so the structure mirrors the actual
// paper forms field-for-field while still being queryable as a single
// collection ("all pending requests for MDA X", "all Form 007s this year").
//
// NOTE ON SCOPE: this model intentionally does NOT live on Asset.js. Several
// of these forms (008 Service Provider Cert, 009 Budget, 010 Training) are
// about the MDA/contractor relationship with FPAM generally, not a single
// asset — so FormRequest is its own top-level collection, with an OPTIONAL
// `linkedAssetId` for the forms that genuinely tie to one asset (002, 006,
// 007, 014, 015).

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const FORM_TYPES = [
  'MAINTENANCE_COMPLIANCE_DECLARATION',      // 001
  'ASSET_INVENTORY_DECLARATION',             // 002
  'PREVENTIVE_MAINTENANCE_SCHEDULE',         // 003
  'MAINTENANCE_ACTIVITY_REPORT',             // 004
  'MAINTENANCE_INCIDENT_REPORT',             // 005
  'MAINTENANCE_WORK_ORDER',                  // 006
  'ASSET_CONDITION_ASSESSMENT',              // 007
  'SERVICE_PROVIDER_CERTIFICATION',          // 008
  'BUDGET_ALLOCATION_UTILIZATION',           // 009
  'TRAINING_CAPACITY_BUILDING',              // 010
  'HSE_COMPLIANCE_CHECKLIST',                // 011
  'AUDIT_RESPONSE_CORRECTIVE_ACTION',        // 012
  'CERTIFICATION_REQUEST',                   // 013
  'EQUIPMENT_CALIBRATION_CERTIFICATE',       // 014
  'EQUIPMENT_DISPOSAL_DECOMMISSIONING',      // 015
];

const STATUS_VALUES = ['Draft', 'Submitted', 'UnderReview', 'Approved', 'Deferred', 'Rejected'];

// Shared attachment shape — mirrors Asset.js's fileRefSchema
const attachmentSchema = new Schema({
  fileId:       { type: Types.ObjectId, required: true },
  filename:     String,
  originalname: String,
  contentType:  String,
  sizeBytes:    Number,
  uploadedAt:   { type: Date, default: Date.now },
  label:        String,   // e.g. "Tax Clearance Certificate"
}, { _id: true });

// ═══════════════════════════════════════════════════════════════════════════
// FORM-SPECIFIC SUB-SCHEMAS — one per form type, field-for-field from the
// actual paper forms. All sub-schemas use { _id: false } since they're
// embedded singletons, not arrays, except where the paper form itself has a
// repeating table (inventory rows, task rows, findings, etc.).
// ═══════════════════════════════════════════════════════════════════════════

// ── 001: Maintenance Compliance Declaration ───────────────────────────────────
const complianceDeclarationSchema = new Schema({
  headOfMdaName:        String,
  headOfMdaDesignation:  String,
  buildingAddress:       String,
  maintenanceContact:    String,
  contactPhoneEmail:     String,
  commitments: {
    structuredPlan:       { type: Boolean, default: false },
    regulatoryCompliance: { type: Boolean, default: false },
    periodicReporting:    { type: Boolean, default: false },
    qualifiedContractors: { type: Boolean, default: false },
    budgetaryAllocation:  { type: Boolean, default: false },
    allowFpamAccess:      { type: Boolean, default: false },
    implementCorrective:  { type: Boolean, default: false },
  },
  signatureName: String,
  designation:   String,
  dateSigned:    Date,
}, { _id: false });

// ── 002: Asset Inventory Declaration ──────────────────────────────────────────
const inventoryDeclarationRowSchema = new Schema({
  sn:                String,
  assetDescription:  String,
  assetType:         { type: String, enum: ['Building', 'Road', 'Facility', 'Equipment', 'Other'] },
  location:          String,
  yearAcquired:      String,
  currentCondition:  { type: String, enum: ['Good', 'Fair', 'Poor', 'Dilapidated'] },
  presentUse:        String,
  remarks:           String,
}, { _id: false });

const inventoryDeclarationSchema = new Schema({
  headOfMdaName:       String,
  headOfMdaDesignation: String,
  mainOfficeAddress:    String,
  assetRecordsContact:  String,
  contactPhoneEmail:    String,
  assets:              [inventoryDeclarationRowSchema],
  accuracyDeclared:    { type: Boolean, default: false },
  signatureName:       String,
  designation:         String,
  dateSigned:          Date,
}, { _id: false });

// ── 003: Preventive Maintenance Schedule Submission ───────────────────────────
const pmScheduleRowSchema = new Schema({
  assetDescription:    String,
  location:            String,
  criticality:         { type: String, enum: ['High', 'Medium', 'Low'] },
  lastMaintenanceDate: Date,
  nextScheduledDate:   Date,
  frequency:           { type: String, enum: ['Weekly', 'Monthly', 'Quarterly', 'Annually'] },
  responsibleOfficer:  String,
}, { _id: false });

const pmScheduleSchema = new Schema({
  maintenanceUnit:       String,
  contactPerson:         String,
  scheduleYearOrQuarter: String,
  items:                [pmScheduleRowSchema],
  routineInspections:    String,
  repairsServicingTasks: String,
  safetyChecks:          String,
  specializedServices:   String,
  internalStaffAssigned: String,
  externalContractors:   String,
  estimatedBudget:       Number,
}, { _id: false });

// ── 004: Maintenance Activity Report ──────────────────────────────────────────
const activityRowSchema = new Schema({
  assetFacility:      String,
  location:           String,
  maintenanceType:    { type: String, enum: ['Preventive', 'Corrective', 'Emergency'] },
  dateCarriedOut:     Date,
  description:        String,
  responsibleUnit:    String,
  cost:               Number,
  status:             { type: String, enum: ['Completed', 'Ongoing', 'Pending'] },
}, { _id: false });

const activityReportSchema = new Schema({
  maintenanceUnit:  String,
  reportPeriod:     String,
  contactPerson:    String,
  activities:      [activityRowSchema],
  challenges: {
    fundingConstraints:   { type: Boolean, default: false },
    lackOfExpertise:      { type: Boolean, default: false },
    contractorDelay:      { type: Boolean, default: false },
    accessRestrictions:   { type: Boolean, default: false },
    other:                String,
  },
  conditionPostMaintenance: String,
  efficiencyImproved:       Boolean,
  furtherActionRequired:    String,
}, { _id: false });

// ── 005: Maintenance Incident Report ──────────────────────────────────────────
const incidentReportSchema = new Schema({
  locationFacility:  String,
  dateOfIncident:    Date,
  timeOfIncident:    String,
  reportedBy:        String,
  incidentType: {
    type: String,
    enum: [
      'Electrical Fault', 'Plumbing/Water Leakage', 'Structural Defect',
      'Mechanical System Failure', 'Fire Safety/Alarm/Sprinkler', 'Flooding/Drainage',
      'Security Breach', 'Other',
    ],
  },
  incidentTypeOther:      String,
  description:            String,
  immediateActionTaken:   String,
  assetsAffected:         String,
  extentOfDamage:         { type: String, enum: ['Minor', 'Moderate', 'Severe'] },
  serviceDisruption:      { type: String, enum: ['None', 'Partial', 'Complete'] },
  estimatedRepairCost:    Number,
  rootCause: {
    type: String,
    enum: [
      'Lack of Preventive Maintenance', 'Natural Wear & Tear', 'Misuse/Negligence',
      'Contractor/Service Failure', 'Force Majeure', 'Other',
    ],
  },
  rootCauseOther:         String,
  followUpActions: {
    immediateRepair:            { type: Boolean, default: false },
    temporaryFixApplied:        { type: Boolean, default: false },
    comprehensiveInvestigation: { type: Boolean, default: false },
    escalationToFpamHq:         { type: Boolean, default: false },
    procurementRequired:        { type: Boolean, default: false },
    other:                      String,
  },
  reportingOfficerName: String,
}, { _id: false });

// ── 006: Maintenance Work Order ───────────────────────────────────────────────
const workOrderSchema = new Schema({
  workOrderNo:      String,
  dateIssued:       Date,
  requestedBy:      String,
  department:       String,
  location:         String,
  requestType:      { type: String, enum: ['Corrective', 'Preventive', 'Emergency', 'Other'] },
  requestTypeOther: String,
  workDescription:  String,
  approvedBy:        String,
  approvalDate:      Date,
  assignedTo:        String,
  startDate:         Date,
  expectedCompletion: Date,
  priority:          { type: String, enum: ['High', 'Medium', 'Low'] },
  materialsRequired: String,
  estimatedCost:     Number,
  workDoneSummary:   String,
  completionDate:    Date,
  verifiedBy:        String,
  status:            { type: String, enum: ['Completed', 'Pending', 'Deferred', 'Rework Needed'] },
}, { _id: false });

// ── 007: Asset Condition Assessment ───────────────────────────────────────────
const conditionRatingSchema = new Schema({
  component: {
    type: String,
    enum: [
      'Structural Integrity', 'Roof/Covering', 'Walls/Finishes', 'Windows & Doors',
      'Electrical Systems', 'Mechanical (HVAC/Plumbing)', 'Drainage/Waterproofing',
      'External Works', 'Safety/Fire Systems',
    ],
  },
  rating:  { type: Number, min: 1, max: 5 },   // 5=Excellent .. 1=Critical
  remarks: String,
}, { _id: false });

const conditionAssessmentSchema = new Schema({
  assessmentCode:      String,
  dateOfAssessment:    Date,
  assessedBy:          String,
  assetCategory: {
    type: String,
    enum: ['Building', 'Road/Car Park', 'Drainage/Utilities', 'Furniture & Fixtures', 'Electrical/Mechanical Equipment', 'Other'],
  },
  assetLocation:       String,
  assetTagNo:          String,
  assetName:           String,
  yearConstructed:     String,
  lastRehabilitation:  String,
  expectedUsefulLife:  String,
  currentUsage:        { type: String, enum: ['Fully Functional', 'Under-utilized', 'Vacant/Idle'] },
  ratings:            [conditionRatingSchema],
  averageScore:        Number,
  conditionStatus:     { type: String, enum: ['Excellent', 'Good', 'Fair', 'Poor', 'Critical'] },
  immediateMaintenanceNeeded: String,
  mediumTermRehab:            String,
  replacementSuggested:       String,
  estimatedCost:               Number,
}, { _id: false });

// ── 008: Service Provider Certification Compliance ────────────────────────────
const staffMemberSchema = new Schema({
  name: String, role: String, qualification: String, yearsExperience: Number,
}, { _id: false });

const pastProjectSchema = new Schema({
  projectName: String, client: String, year: String, value: Number,
}, { _id: false });

const providerCertificationSchema = new Schema({
  providerName:      String,
  rcNumber:          String,
  tin:               String,
  contactAddress:    String,
  emailPhone:        String,
  category: {
    type: String,
    enum: ['Facility Management', 'Civil/Structural Works', 'Electrical/Mechanical Maintenance', 'Sanitation/Waste Management', 'Security/Safety Services', 'Other'],
  },
  categoryOther:     String,
  statutoryCompliance: {
    cacRegistration:       { compliant: Boolean, remarks: String },
    taxClearance:          { compliant: Boolean, remarks: String },
    pencomCertificate:     { compliant: Boolean, remarks: String },
    itfCompliance:         { compliant: Boolean, remarks: String },
    nsitfCertificate:      { compliant: Boolean, remarks: String },
    bppRegistration:       { compliant: Boolean, remarks: String },
    hseCertification:      { compliant: Boolean, remarks: String },
  },
  keyStaff:         [staffMemberSchema],
  pastProjects:     [pastProjectSchema],
  equipmentAvailable: String,
  panelReview: {
    statutoryCompliance: { type: String, enum: ['Approved', 'Not Approved'] },
    technicalCapacity:   { type: String, enum: ['Approved', 'Not Approved'] },
    pastPerformance:     { type: String, enum: ['Satisfactory', 'Unsatisfactory'] },
    hseStandards:        { type: String, enum: ['Compliant', 'Non-Compliant'] },
  },
  overallDecision:  { type: String, enum: ['CERTIFIED', 'NOT CERTIFIED'] },
  validityPeriod:   String,
}, { _id: false });

// ── 009: Budget Allocation & Utilization ──────────────────────────────────────
const budgetLineSchema = new Schema({
  item: String, approvedBudget: Number, dateOfAllocation: Date, sourceOfFunds: String, remarks: String,
}, { _id: false });

const utilizationLineSchema = new Schema({
  item: String, amountUtilized: Number, dateOfExpenditure: Date, paymentVoucherRef: String, balance: Number, remarks: String,
}, { _id: false });

const budgetAllocationSchema = new Schema({
  budgetYear:        String,
  projectTitle:      String,
  projectLocation:   String,
  budgetCode:        String,
  allocation:       [budgetLineSchema],
  totalAllocation:   Number,
  utilization:      [utilizationLineSchema],
  totalUtilized:     Number,
  targetOutput:      String,
  actualOutput:      String,
  variance:          String,
  varianceExplanation: String,
}, { _id: false });

// ── 010: Training & Capacity Building Compliance ──────────────────────────────
const trainingRowSchema = new Schema({
  title: String, dates: String, venueMode: String, targetParticipants: String,
  staffNominated: Number, staffAttended: Number, serviceProvider: String,
}, { _id: false });

const trainingComplianceSchema = new Schema({
  unitDivision:       String,
  reportingPeriod:    String,
  officerInCharge:    String,
  trainings:         [trainingRowSchema],
  compliance: {
    alignedWithPolicy:       Boolean,
    providerAccredited:      Boolean,
    staffTrainedPreventive:  Boolean,
    modulesDocumented:       Boolean,
    postAssessmentConducted: Boolean,
    certificatesArchived:    Boolean,
  },
  skillsAcquired:        String,
  gapsIdentified:        String,
  followUpActions:       String,
  recommendations:       String,
}, { _id: false });

// ── 011: HSE Compliance Checklist ─────────────────────────────────────────────
const hseItemSchema = new Schema({ label: String, compliant: Boolean, remarks: String }, { _id: false });

const hseChecklistSchema = new Schema({
  projectTitle:      String,
  location:          String,
  contractor:        String,
  projectDuration:   String,
  reportingPeriod:   String,
  generalSafety:      [hseItemSchema],
  siteManagement:     [hseItemSchema],
  environmental:      [hseItemSchema],
  healthWelfare:      [hseItemSchema],
  complianceMonitoring: [hseItemSchema],
}, { _id: false });

// ── 012: Audit Response & Corrective Action ───────────────────────────────────
const auditFindingSchema = new Schema({
  findingNo: String, observation: String, riskLevel: { type: String, enum: ['High', 'Medium', 'Low'] }, correctiveActionRequired: String,
}, { _id: false });

const correctiveActionSchema = new Schema({
  findingNo: String, action: String, responsibleOfficer: String, timeline: String, resourcesNeeded: String,
}, { _id: false });

const auditResponseSchema = new Schema({
  projectTitle:        String,
  auditReferenceNo:    String,
  dateOfAudit:         Date,
  auditors:            String,
  responsibleOfficer:  String,
  findings:           [auditFindingSchema],
  correctiveActions:  [correctiveActionSchema],
  implementationStatus: { type: String, enum: ['Implemented', 'In Progress', 'Pending'] },
  implementationDate:   Date,
  verifiedByFpam:       { type: String, enum: ['Verified - Compliant', 'Verified - Non-Compliant'] },
  remarks:              String,
}, { _id: false });

// ── 013: Certification Request Submission ─────────────────────────────────────
const certificationRequestSchema = new Schema({
  organizationName:   String,
  projectSiteAddress: String,
  projectTitle:       String,
  contractReferenceNo: String,
  contactPerson:      String,
  contactDesignation: String,
  phoneEmail:         String,
  certificationTypeRequested: {
    type: String,
    enum: [
      'Maintenance Compliance Certification', 'Service Provider Competence Certification',
      'Asset Condition Assessment Certification', 'HSE Compliance Certification', 'Other',
    ],
  },
  certificationTypeOther: String,
  supportingDocsChecklist: {
    complianceDeclaration:    Boolean,
    inventoryDeclaration:     Boolean,
    pmScheduleSubmission:     Boolean,
    activityIncidentReports:  Boolean,
    providerCertification:    Boolean,
    hseChecklist:             Boolean,
    budgetForm:               Boolean,
    trainingForm:             Boolean,
    auditResponseForm:        Boolean,
    other:                    String,
  },
  // Optional links to the actual supporting FormRequest documents already
  // submitted, so the reviewer can click straight through to the evidence
  // rather than relying on the checklist alone.
  linkedFormRequestIds: [{ type: Types.ObjectId, ref: 'FormRequest' }],
  applicationReferenceNumber: String,
}, { _id: false });

// ── 014: Equipment Calibration/Inspection Certificate Submission ─────────────
const equipmentCalibrationRowSchema = new Schema({
  equipmentNameType: String, modelSerialNo: String, locationOfUse: String,
  lastCalibrationDate: Date, nextDueDate: Date, status: { type: String, enum: ['Pass', 'Fail'] },
}, { _id: false });

const calibrationSubmissionSchema = new Schema({
  contactPerson:   String,
  contactDesignation: String,
  phoneEmail:      String,
  equipment:      [equipmentCalibrationRowSchema],
  attachmentsChecklist: {
    manufacturerCertificate: Boolean,
    independentLabCertificate: Boolean,
    internalReport:          Boolean,
    hseCertificate:          Boolean,
    other:                   String,
  },
}, { _id: false });

// ── 015: Equipment & Material Disposal/Decommissioning Compliance ────────────
const disposalAssetRowSchema = new Schema({
  assetCategory: String, description: String, tagSerialNumber: String, location: String,
  dateOfAcquisition: Date,
  currentCondition: { type: String, enum: ['Serviceable', 'Unserviceable', 'Obsolete'] },
  proposedDisposalMethod: { type: String, enum: ['Auction', 'Transfer', 'Scrap', 'Donation', 'Other'] },
}, { _id: false });

const disposalDecommissioningSchema = new Schema({
  departmentUnit:  String,
  contactPerson:   String,
  contactDesignation: String,
  phoneEmail:      String,
  assets:         [disposalAssetRowSchema],
  reasonForDisposal: {
    type: String,
    enum: ['End-of-Life/Obsolete', 'Beyond Economic Repair', 'Replacement by New Equipment', 'Safety/Environmental Hazard', 'Other'],
  },
  reasonOther:      String,
  supportingDocsChecklist: {
    conditionAssessmentReport: Boolean,
    boardOfSurveyReport:       Boolean,
    hseClearance:              Boolean,
    valuationReport:           Boolean,
    disposalCommitteeApproval: Boolean,
  },
}, { _id: false });

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCHEMA
// ═══════════════════════════════════════════════════════════════════════════
const formRequestSchema = new Schema({
  formType: { type: String, enum: FORM_TYPES, required: true },

  // Which MDA this request is for. For an MDA Agent submission this is
  // FORCED server-side to the submitter's own MDA (see form_requests_routes.js)
  // — never trust a client-supplied value for that role. FPAM staff
  // (Supervisor/Sub-Head/System Admin) may set this to any MDA, matching the
  // "create on behalf of any MDA" requirement.
  mda: { type: String, required: true },

  // Optional — set only for the forms that genuinely tie to one specific
  // asset already in the registry (002, 006, 007, 014, 015).
  linkedAssetId: { type: String, default: null },   // Asset.assetId, not Mongo _id

  submittedBy: { type: Types.ObjectId, ref: 'User', required: true },
  submittedAt: { type: Date, default: Date.now },

  status: { type: String, enum: STATUS_VALUES, default: 'Draft' },

  // Exactly one of these is populated, matching `formType`.
  complianceDeclaration:   complianceDeclarationSchema,
  inventoryDeclaration:    inventoryDeclarationSchema,
  pmSchedule:              pmScheduleSchema,
  activityReport:          activityReportSchema,
  incidentReport:          incidentReportSchema,
  workOrder:               workOrderSchema,
  conditionAssessment:     conditionAssessmentSchema,
  providerCertification:   providerCertificationSchema,
  budgetAllocation:        budgetAllocationSchema,
  trainingCompliance:      trainingComplianceSchema,
  hseChecklist:            hseChecklistSchema,
  auditResponse:           auditResponseSchema,
  certificationRequest:    certificationRequestSchema,
  calibrationSubmission:   calibrationSubmissionSchema,
  disposalDecommissioning: disposalDecommissioningSchema,

  attachments: [attachmentSchema],

  // ── Review / FPAM-side ─────────────────────────────────────────────────
  reviewedBy:      { type: Types.ObjectId, ref: 'User' },
  reviewedAt:       Date,
  reviewRemarks:    String,
  reviewStatusDetail: String,   // e.g. the form-specific status enum text (Approved/Deferred/etc — many forms use slightly different wording on the paper form; store the exact label used)

  // ── Certificate issuance ────────────────────────────────────────────────
  certificateIssued:   { type: Boolean, default: false },
  certificateFileId:   Types.ObjectId,   // GridFS ref to generated PDF
  certificateIssuedBy: { type: Types.ObjectId, ref: 'User' },
  certificateIssuedAt:  Date,
  certificateNumber:    String,   // human-readable ref, e.g. FPAM/CERT/2026/0042
  physicalCopyIssued:   { type: Boolean, default: false },   // per Q2: a physical copy is also issued — track that it went out
  physicalCopyIssuedAt: Date,
}, { timestamps: true });

formRequestSchema.index({ mda: 1, status: 1 });
formRequestSchema.index({ formType: 1 });
formRequestSchema.index({ submittedBy: 1 });
formRequestSchema.index({ linkedAssetId: 1 });
formRequestSchema.index({ certificateNumber: 1 });

module.exports = mongoose.model('FormRequest', formRequestSchema);
module.exports.FORM_TYPES = FORM_TYPES;
module.exports.STATUS_VALUES = STATUS_VALUES;
