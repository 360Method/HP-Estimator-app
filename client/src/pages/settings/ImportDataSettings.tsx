/**
 * ImportDataSettings — Settings panel that embeds the data migration wizard.
 * Accessible via Settings → Data → Import Data
 */
import DataMigrationPage from '@/pages/DataMigrationPage';

export default function ImportDataSettings() {
  return (
    <div className="p-6">
      <DataMigrationPage embedded />
    </div>
  );
}
