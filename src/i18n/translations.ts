/**
 * Translations for the Ethical Top Closer platform
 * Default: German (DE) | Switch: English (EN)
 */

export type Lang = 'de' | 'en';

export const translations = {
  // ─── Navigation & Layout ───
  nav_dashboard: { de: 'Dashboard', en: 'Dashboard' },
  nav_academy: { de: 'Academy', en: 'Academy' },
  nav_practice: { de: 'Praxis', en: 'Practice' },
  nav_certification: { de: 'Zertifizierung', en: 'Certification' },
  nav_placement: { de: 'Placement', en: 'Placement' },
  nav_community: { de: 'Community', en: 'Community' },
  nav_tools: { de: 'Tools', en: 'Tools' },
  nav_help: { de: 'Hilfe', en: 'Help' },
  nav_admin: { de: 'Admin', en: 'Admin' },
  nav_sign_out: { de: 'Abmelden', en: 'Sign out' },
  nav_collapse: { de: 'Einklappen', en: 'Collapse' },
  nav_start: { de: 'Start Here', en: 'Start Here' },
  nav_quick_access: { de: 'Schnellzugriff', en: 'Quick Access' },

  // ─── Dashboard ───
  dash_welcome: { de: 'Willkommen zurück', en: 'Welcome back' },
  dash_subtitle: {
    de: 'Dein strukturiertes Karrieresystem – von der Qualifikation bis zum Placement.',
    en: 'Your structured career system – from qualification to placement.',
  },
  dash_current_phase: { de: 'Aktuelle Phase', en: 'Current Phase' },
  dash_overall_progress: { de: 'Gesamtfortschritt', en: 'Overall Progress' },
  dash_modules_of: { de: 'von', en: 'of' },
  dash_modules: { de: 'Modulen', en: 'Modules' },
  dash_status: { de: 'Status', en: 'Status' },
  dash_certification: { de: 'Zertifizierung', en: 'Certification' },
  dash_placement_readiness: { de: 'Placement Readiness', en: 'Placement Readiness' },
  dash_ready: { de: 'Bereit', en: 'Ready' },
  dash_in_preparation: { de: 'In Vorbereitung', en: 'In Preparation' },
  dash_next_step: { de: 'Nächster Schritt', en: 'Next Step' },
  dash_next_dev_step: { de: 'Dein nächster Entwicklungsschritt', en: 'Your Next Development Step' },
  dash_continue_step: { de: 'Aktuellen Schritt fortsetzen', en: 'Continue your current step' },
  dash_career_path: { de: 'Dein Fortschritt', en: 'Your Progress' },
  dash_career_path_intro: {
    de: 'Du siehst, wo du stehst und was dein nächster Schritt im Karriereweg ist.',
    en: 'You can see where you stand and what your next step in the career path is.',
  },
  dash_announcements: { de: 'Ankündigungen', en: 'Announcements' },
  dash_qualification_status: { de: 'Qualifikationsstatus', en: 'Qualification Status' },
  dash_back_to_dashboard: { de: 'Zum Dashboard', en: 'Back to Dashboard' },

  // ─── Career Steps ───
  career_step_completed: { de: 'Abgeschlossen', en: 'Completed' },
  career_step_current: { de: 'Aktueller Schritt', en: 'Current Step' },
  career_step_next: { de: 'Nächster Schritt', en: 'Next Step' },
  career_step_next_desc: {
    de: 'Dieser Schritt wird zugänglich, sobald alle Anforderungen erfüllt sind.',
    en: 'This step becomes accessible once all requirements are fulfilled.',
  },

  // ─── Member Status ───
  status_enrolled: { de: 'Eingeschrieben', en: 'Enrolled' },
  status_active: { de: 'Aktiv', en: 'Active' },
  status_graduated: { de: 'Abgeschlossen', en: 'Graduated' },
  status_paused: { de: 'Pausiert', en: 'Paused' },
  status_not_started: { de: 'Nicht gestartet', en: 'Not Started' },
  status_in_progress: { de: 'In Bearbeitung', en: 'In Progress' },
  status_passed: { de: 'Bestanden', en: 'Passed' },
  status_failed: { de: 'Nicht bestanden', en: 'Failed' },

  // ─── Career Stages ───
  level_label: { de: 'Karriereschritt', en: 'Career Step' },
  level_active: { de: 'Aktiv', en: 'Active' },

  level_0_title: { de: 'Bewerber', en: 'Applicant' },
  level_0_role: { de: 'Bewerbung & Qualifikation', en: 'Application & Qualification' },
  level_1_title: { de: 'Trainee', en: 'Trainee' },
  level_1_role: { de: 'Opener', en: 'Opener' },
  level_2_title: { de: 'Associate Setter', en: 'Associate Setter' },
  level_2_role: { de: 'Mentee', en: 'Mentee' },
  level_3_title: { de: 'Senior Setter', en: 'Senior Setter' },
  level_3_role: { de: 'Setter (Mentor)', en: 'Setter (Mentor)' },
  level_4_title: { de: 'Closer (Placement Track)', en: 'Closer (Placement Track)' },
  level_4_role: { de: 'Closer (Mentee)', en: 'Closer (Mentee)' },
  level_5_title: { de: 'Managing Closer', en: 'Managing Closer' },
  level_5_role: { de: 'Placement Ready / Mentor', en: 'Placement Ready / Mentor' },
  level_6_title: { de: 'Senior Closer', en: 'Senior Closer' },
  level_6_role: { de: 'Placed', en: 'Placed' },
  level_7_title: { de: 'Director', en: 'Director' },
  level_7_role: { de: 'Leadership', en: 'Leadership' },
  level_8_title: { de: 'Partner', en: 'Partner' },
  level_8_role: { de: 'Strategische Partnerschaft', en: 'Strategic Partnership' },
  level_9_title: { de: 'Admin', en: 'Admin' },
  level_9_role: { de: 'Systemadmin', en: 'System Admin' },

  // ─── Sidebar Stage Labels ───
  stage_prospect: { de: 'Bewerber', en: 'Applicant' },
  stage_opener: { de: 'Trainee', en: 'Trainee' },
  stage_setter: { de: 'Associate Setter', en: 'Associate Setter' },
  stage_senior_associate: { de: 'Senior Setter', en: 'Senior Setter' },
  stage_junior_manager: { de: 'Closer (Placement Track)', en: 'Closer (Placement Track)' },
  stage_manager: { de: 'Managing Closer', en: 'Managing Closer' },
  stage_senior_manager: { de: 'Senior Closer', en: 'Senior Closer' },
  stage_director: { de: 'Director', en: 'Director' },
  stage_partner: { de: 'Partner', en: 'Partner' },
  stage_inner_circle: { de: 'Inner Circle', en: 'Inner Circle' },

  // ─── Application Status (Applicant) ───
  app_status_label: { de: 'Bewerbungsstatus', en: 'Application Status' },
  app_status_open: { de: 'Offen', en: 'Open' },
  app_status_open_desc: { de: 'Gespräch noch nicht geführt', en: 'Initial call not yet conducted' },
  app_status_in_process: { de: 'Im Prozess', en: 'In Process' },
  app_status_in_process_desc: { de: 'Erstes Gespräch geführt', en: 'First call completed' },
  app_status_completed: { de: 'Abgeschlossen', en: 'Completed' },
  app_status_completed_desc: { de: 'Zweites Gespräch geführt', en: 'Second call completed' },

  // ─── KPI Labels ───
  kpi_close_rate: { de: 'Close Rate', en: 'Close Rate' },
  kpi_show_rate: { de: 'Show Rate', en: 'Show Rate' },
  kpi_revenue: { de: 'Umsatz', en: 'Revenue' },
  kpi_storno: { de: 'Storno Rate', en: 'Chargeback Rate' },
  kpi_response_time: { de: 'Reaktionszeit', en: 'Response Time' },
  kpi_follow_up: { de: 'Follow-Up Quote', en: 'Follow-Up Rate' },
  kpi_crm_hygiene: { de: 'CRM Hygiene', en: 'CRM Hygiene' },
  kpi_lead_quality: { de: 'Lead-Qualität', en: 'Lead Quality' },
  kpi_epc: { de: 'Verdienst pro Call', en: 'Earnings per Call' },
  kpi_calls_week: { de: 'Calls/Woche', en: 'Calls/Week' },
  kpi_section_performance: { de: 'Performance KPIs', en: 'Performance KPIs' },
  kpi_section_execution: { de: 'Execution KPIs', en: 'Execution KPIs' },
  kpi_section_advanced: { de: 'Erweiterte KPIs', en: 'Advanced KPIs' },
  kpi_placement_ready: { de: 'Placement Readiness', en: 'Placement Readiness' },
  kpi_placement_ready_desc: { de: 'Alle KPIs erfüllt – bereit für Placement', en: 'All KPIs met – ready for placement' },
  kpi_target: { de: 'Ziel', en: 'Target' },

  // ─── Career Path Labels ───
  cp_placement_ready: { de: 'Placement Ready', en: 'Placement Ready' },
  cp_placed: { de: 'Placed', en: 'Placed' },
  cp_mentor: { de: 'Mentor', en: 'Mentor' },
  cp_mentee: { de: 'Mentee', en: 'Mentee' },
  cp_invite_only: { de: 'Nur auf Einladung', en: 'Invitation Only' },
  cp_role: { de: 'Rolle', en: 'Role' },
  cp_core_activity: { de: 'Kernaktivität', en: 'Core Activity' },

  // ─── Next Steps (by stage) ───
  next_prospect: { de: 'Bewerbung fortsetzen', en: 'Continue Application' },
  next_prospect_desc: { de: 'Sichere dir deinen Platz im Programm.', en: 'Secure your place in the program.' },
  next_opener: { de: 'Training fortsetzen', en: 'Continue Training' },
  next_opener_desc: { de: 'Absolviere dein Opener Training, um den nächsten Schritt zu erreichen.', en: 'Complete your Opener Training to reach the next step.' },
  next_setter: { de: 'Qualifikation abschließen', en: 'Complete Qualification' },
  next_setter_desc: { de: 'Bestehe die Zertifizierung und qualifiziere dich für den nächsten Karriereschritt.', en: 'Pass the certification and qualify for the next career step.' },
  next_senior_associate: { de: 'Mentee betreuen', en: 'Mentor a Mentee' },
  next_senior_associate_desc: { de: 'Betreue Setter und stabilisiere deine KPIs.', en: 'Mentor Setters and stabilize your KPIs.' },
  next_junior_manager: { de: 'Closing-Training', en: 'Closing Training' },
  next_junior_manager_desc: { de: 'Absolviere das Closer Training und qualifiziere dich weiter.', en: 'Complete the Closer Training and continue your qualification.' },
  next_manager: { de: 'Für Placement bewerben', en: 'Apply for Placement' },
  next_manager_desc: { de: 'Erfülle alle KPIs und bewirb dich für Placement.', en: 'Meet all KPIs and apply for Placement.' },
  next_senior_manager: { de: 'Advanced Lab', en: 'Advanced Lab' },
  next_senior_manager_desc: { de: 'Optimiere deine Close Rate und skaliere.', en: 'Optimize your Close Rate and scale.' },
  next_director: { de: 'Skalierung vorantreiben', en: 'Drive Scaling' },
  next_director_desc: { de: 'Leadership & Skalierung.', en: 'Leadership & Scaling.' },
  next_partner: { de: 'Inner Circle', en: 'Inner Circle' },
  next_partner_desc: { de: 'Strategische Einbindung auf höchstem Niveau.', en: 'Strategic involvement at the highest level.' },

  // ─── General UI ───
  loading: { de: 'Laden…', en: 'Loading…' },
  save: { de: 'Speichern', en: 'Save' },
  cancel: { de: 'Abbrechen', en: 'Cancel' },
  error_generic: { de: 'Ein Fehler ist aufgetreten.', en: 'An error occurred.' },
  error_invalid_email: { de: 'Ungültige E-Mail-Adresse.', en: 'Invalid email address.' },
  not_unlocked: { de: 'Noch nicht zugänglich', en: 'Not yet accessible' },

  // ─── Landing / Bewerbung ───
  apply_now: { de: 'Jetzt bewerben', en: 'Apply Now' },
  book_appointment: { de: 'Termin buchen', en: 'Book Appointment' },

  // ─── Landing Hero (Market-Specific) ───
  hero_headline: {
    de: 'Werde Ethical Top Closer –\nund gestalte dein Einkommen selbstbestimmt.',
    en: 'Become an Ethical Top Closer –\nBuild Your Income on Your Terms.',
  },
  hero_subheadline: {
    de: 'Verlasse das 9–5-Modell und baue dir ein leistungsbasiertes Einkommen im High-Ticket-Bereich auf.',
    en: 'Leave the 9-to-5 behind. Build a performance-based income in high-ticket advisory.',
  },
  hero_body: {
    de: 'Dabei geht es nicht um aggressiven Verkauf, sondern um Beratung mit echtem Impact – Gespräche, in denen Menschen die richtige nächste Entscheidung für ihr Wachstum treffen.',
    en: 'This isn\'t about hard selling. It\'s about advisory-driven conversations where people make the right decision for their growth.',
  },
  hero_cta: {
    de: 'Jetzt Zugang zur Qualifikation sichern',
    en: 'Get Access to Qualification',
  },
  hero_scarcity: {
    de: 'Selektive Aufnahme · Limitierte Plätze',
    en: 'Selective Admission · Limited Spots',
  },

  // ─── Landing Sections (Market-Specific) ───
  problem_headline: {
    de: 'Du willst raus aus der 9–5-Logik – aber nicht um jeden Preis.',
    en: 'You Want Out of the 9-to-5 – But Not at Any Cost.',
  },
  value_prop_headline: {
    de: 'Was dich als Ethical Closer auszeichnet',
    en: 'What Makes an Ethical Closer Stand Out',
  },
  final_cta_headline: {
    de: 'Wenn du Closing professionell, strukturiert und selbstbestimmt erlernen willst – starte hier.',
    en: 'Ready to learn closing the ethical way? Start here.',
  },
  final_cta_button: {
    de: 'Platz beantragen',
    en: 'Apply for Your Spot',
  },
  process_headline: {
    de: 'So startet der Prozess',
    en: 'How the Process Works',
  },
  process_cta: {
    de: 'Eignung prüfen',
    en: 'Check Your Fit',
  },
  self_determination_headline: {
    de: 'Du bestimmst Tempo und Intensität.',
    en: 'You Set the Pace.',
  },
  self_determination_body_1: {
    de: 'Es gibt keinen Druck.\nKein Zwang.\nKein künstliches Momentum.',
    en: 'No pressure.\nNo force.\nNo artificial urgency.',
  },
  self_determination_body_2: {
    de: 'Du entwickelst dich so schnell, wie es zu deinem Leben passt.',
    en: 'You grow at the speed that fits your life.',
  },
  self_determination_highlight: {
    de: 'Work-Life-Balance ist kein Widerspruch – sondern Teil der Strategie.',
    en: 'Work-life balance isn\'t a compromise – it\'s part of the strategy.',
  },

  // ─── Workspace Section ───
  workspace_title: { de: 'Dein Arbeitsbereich', en: 'Your Workspace' },
  workspace_desc: { de: 'Dein aktueller Arbeitsbereich, abgestimmt auf deine Rolle.', en: 'Your current working environment, aligned with your role.' },

  // ─── Community Section ───
  community_title: { de: 'Deine Peer Group', en: 'Your Peer Group' },
  community_desc: { de: 'Du bist mit anderen verbunden, die auf einem ähnlichen Niveau arbeiten.', en: 'You are connected with others operating at a similar level.' },

  // ─── Training Section ───
  training_title: { de: 'Training & Qualifikation', en: 'Training & Qualification' },
  training_desc: { de: 'Alle Materialien unterstützen deinen aktuellen Schritt und bereiten dich auf die nächste Verantwortungsebene vor.', en: 'All materials support your current step and prepare you for the next level of responsibility.' },

  // ─── Practical Section ───
  practice_title: { de: 'Praktische Anwendung', en: 'Practical Application' },
  practice_desc: { de: 'Wende deine Fähigkeiten in strukturierten, realen Szenarien an.', en: 'Apply your skills in structured, real-world scenarios.' },
} as const;

export type TranslationKey = keyof typeof translations;
