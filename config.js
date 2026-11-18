// Supabase-Projekt «Leistungs App» (eu-west-1) für Rangliste, Gilden und Duelle.
// Beide Werte sind öffentlich gedacht und dürfen im Repository stehen.
// Zugriff nur über die geprüften Funktionen aus supabase_setup.sql, die Tabellen selbst sind gesperrt.
window.APP_CONFIG = {
  supabaseUrl: 'https://efsznvanzievcxvewgpi.supabase.co',
  supabaseKey: 'sb_publishable_mJIRn9_fyhTj2Wwm9A_fSw_1xifb1HF', // öffentlicher Schlüssel (publishable key)
  teacherKey: '',           // öffentlicher Schlüssel aus pruefen.html (für den QR-Code mit dem Lernstand)
  weeklyGoalPerPlayer: 100, // Klassenziel: XP pro Schüler und Woche
  schoolCode: 'HALINGEN'    // Schulcode für die schulinterne Wertung und das Klassenduell (leer lassen = ohne)
};
