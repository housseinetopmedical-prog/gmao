-- Organisation metier de la base selon les libelles visibles dans la plateforme.
-- Les noms techniques Prisma restent inchanges dans le code, mais les tables
-- affichees dans phpMyAdmin utilisent les noms francais de l'application.

SET @current_schema = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = @current_schema AND table_name = 'equipements')
    AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = @current_schema AND table_name = 'materiels'),
    'RENAME TABLE `equipements` TO `materiels`',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = @current_schema AND table_name = 'documents_equipements')
    AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = @current_schema AND table_name = 'documents_materiels'),
    'RENAME TABLE `documents_equipements` TO `documents_materiels`',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- La plateforme parle de demandes d'intervention, pas de reclamations.
-- Certains exports anciens avaient deja renomme cette table en `interventions`.
CREATE TABLE IF NOT EXISTS `demandes_intervention` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customerName` varchar(191) NOT NULL,
  `contactEmail` varchar(191) NOT NULL,
  `phone` varchar(191) DEFAULT NULL,
  `serialNumber` varchar(191) NOT NULL,
  `deviceModel` varchar(191) NOT NULL,
  `description` text NOT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'PENDING',
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  `attachmentUrl` varchar(191) DEFAULT NULL,
  `checklist` longtext DEFAULT NULL,
  `interventionType` varchar(191) DEFAULT NULL,
  `satisfactionRate` int(11) DEFAULT NULL,
  `techComment` text DEFAULT NULL,
  `sageCode` varchar(191) DEFAULT NULL,
  `ticketId` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `demandes_intervention_ticketId_key` (`ticketId`),
  CONSTRAINT `demandes_intervention_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = (
  SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = @current_schema AND table_name = 'reclamations')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = @current_schema AND table_name = 'demandes_intervention'),
    'INSERT IGNORE INTO `demandes_intervention` SELECT * FROM `reclamations`',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = @current_schema AND table_name = 'interventions')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = @current_schema AND table_name = 'demandes_intervention'),
    'INSERT IGNORE INTO `demandes_intervention` SELECT * FROM `interventions`',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Tables anciennes qui n'ont plus d'effet dans la plateforme actuelle.
DROP TABLE IF EXISTS `message`;
DROP TABLE IF EXISTS `documents_equipements`;
DROP TABLE IF EXISTS `equipements`;
DROP TABLE IF EXISTS `reclamations`;
DROP TABLE IF EXISTS `interventions`;
