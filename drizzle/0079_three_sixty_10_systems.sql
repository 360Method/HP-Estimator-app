ALTER TABLE `threeSixtyPropertySystems`
  MODIFY COLUMN `systemType` enum(
    'hvac',
    'roof',
    'plumbing',
    'electrical',
    'foundation',
    'exterior_siding',
    'landscaping_drainage',
    'interior',
    'appliances',
    'safety_security'
  ) NOT NULL;
