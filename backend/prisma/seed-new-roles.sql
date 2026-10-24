INSERT INTO `utilisateurs` (`email`, `password`, `name`, `role`, `createdAt`, `updatedAt`)
VALUES
  ('appels.offre@biomed.ma', 'Topmedicalsav', 'Responsable Appels d''Offre', 'RESPONSABLE_APPELS_OFFRE', NOW(), NOW()),
  ('import@biomed.ma', 'Topmedicalsav', 'Responsable Import', 'IMPORT', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `password` = VALUES(`password`),
  `name` = VALUES(`name`),
  `role` = VALUES(`role`),
  `updatedAt` = NOW();
