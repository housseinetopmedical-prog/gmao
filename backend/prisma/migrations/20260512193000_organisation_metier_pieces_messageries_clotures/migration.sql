-- Organisation metier demandee pour les pieces, les messageries et les tickets clotures.
-- Les anciennes tables restent conservees par renommage quand elles contiennent des donnees utiles.

RENAME TABLE
  `bons_achat` TO `pieces_importees`,
  `lignes_bons_achat` TO `details_pieces_importees`,
  `pieces_detachees` TO `pieces_locales`,
  `mouvements_stock` TO `mouvements_pieces_locales`,
  `tickets_internes` TO `conversations_messagerie`,
  `messages_tickets_internes` TO `messagerie`;

ALTER TABLE `pieces_importees`
  ADD COLUMN `equipmentId` int(11) DEFAULT NULL,
  ADD COLUMN `ticketId` int(11) DEFAULT NULL,
  ADD KEY `pieces_importees_equipmentId_idx` (`equipmentId`),
  ADD KEY `pieces_importees_ticketId_idx` (`ticketId`),
  ADD CONSTRAINT `pieces_importees_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `materiels` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `pieces_importees_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `pieces_importees` pi
SET `ticketId` = (
  SELECT MIN(dpi.`ticketId`)
  FROM `details_pieces_importees` dpi
  WHERE dpi.`orderId` = pi.`id` AND dpi.`ticketId` IS NOT NULL
)
WHERE pi.`ticketId` IS NULL;

UPDATE `pieces_importees` pi
JOIN `tickets` t ON t.`id` = pi.`ticketId`
SET pi.`equipmentId` = t.`equipmentId`
WHERE pi.`equipmentId` IS NULL;

ALTER TABLE `pieces_locales`
  ADD COLUMN `equipmentId` int(11) DEFAULT NULL,
  ADD COLUMN `ticketId` int(11) DEFAULT NULL,
  ADD COLUMN `userId` int(11) DEFAULT NULL,
  ADD KEY `pieces_locales_equipmentId_idx` (`equipmentId`),
  ADD KEY `pieces_locales_ticketId_idx` (`ticketId`),
  ADD KEY `pieces_locales_userId_idx` (`userId`),
  ADD CONSTRAINT `pieces_locales_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `materiels` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `pieces_locales_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `pieces_locales_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `utilisateurs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `pieces_utilisees` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ticketId` int(11) DEFAULT NULL,
  `equipmentId` int(11) DEFAULT NULL,
  `userId` int(11) DEFAULT NULL,
  `designation` varchar(191) NOT NULL,
  `quantity` double NOT NULL DEFAULT 1,
  `supplierCode` varchar(191) DEFAULT NULL,
  `sageCode` varchar(191) DEFAULT NULL,
  `costPrice` double DEFAULT NULL,
  `purchasePrice` double DEFAULT NULL,
  `purchaseCurrency` varchar(191) DEFAULT NULL,
  `salePriceTtc` double DEFAULT NULL,
  `usedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `commentaire` text DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `pieces_utilisees_ticketId_idx` (`ticketId`),
  KEY `pieces_utilisees_equipmentId_idx` (`equipmentId`),
  KEY `pieces_utilisees_userId_idx` (`userId`),
  CONSTRAINT `pieces_utilisees_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pieces_utilisees_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `materiels` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pieces_utilisees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `utilisateurs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `main_oeuvre` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ticketId` int(11) DEFAULT NULL,
  `equipmentId` int(11) DEFAULT NULL,
  `userId` int(11) DEFAULT NULL,
  `designation` varchar(191) NOT NULL,
  `heures` double NOT NULL DEFAULT 0,
  `prixHoraire` double DEFAULT NULL,
  `prixTotal` double DEFAULT NULL,
  `commentaire` text DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `main_oeuvre_ticketId_idx` (`ticketId`),
  KEY `main_oeuvre_equipmentId_idx` (`equipmentId`),
  KEY `main_oeuvre_userId_idx` (`userId`),
  CONSTRAINT `main_oeuvre_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `main_oeuvre_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `materiels` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `main_oeuvre_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `utilisateurs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mises_a_jour` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ticketId` int(11) DEFAULT NULL,
  `equipmentId` int(11) DEFAULT NULL,
  `userId` int(11) DEFAULT NULL,
  `designation` varchar(191) NOT NULL,
  `versionAvant` varchar(191) DEFAULT NULL,
  `versionApres` varchar(191) DEFAULT NULL,
  `prix` double DEFAULT NULL,
  `commentaire` text DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `mises_a_jour_ticketId_idx` (`ticketId`),
  KEY `mises_a_jour_equipmentId_idx` (`equipmentId`),
  KEY `mises_a_jour_userId_idx` (`userId`),
  CONSTRAINT `mises_a_jour_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `mises_a_jour_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `materiels` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `mises_a_jour_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `utilisateurs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `nouvelles_installations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ticketId` int(11) DEFAULT NULL,
  `equipmentId` int(11) DEFAULT NULL,
  `userId` int(11) DEFAULT NULL,
  `designation` varchar(191) NOT NULL,
  `licence` varchar(191) DEFAULT NULL,
  `prix` double DEFAULT NULL,
  `commentaire` text DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `nouvelles_installations_ticketId_idx` (`ticketId`),
  KEY `nouvelles_installations_equipmentId_idx` (`equipmentId`),
  KEY `nouvelles_installations_userId_idx` (`userId`),
  CONSTRAINT `nouvelles_installations_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `nouvelles_installations_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `materiels` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `nouvelles_installations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `utilisateurs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `messagerie_fournisseur` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `threadId` varchar(191) NOT NULL,
  `ticketId` int(11) DEFAULT NULL,
  `equipmentId` int(11) DEFAULT NULL,
  `expediteurId` int(11) DEFAULT NULL,
  `fournisseur` varchar(191) DEFAULT NULL,
  `fournisseurEmail` varchar(191) DEFAULT NULL,
  `sujet` varchar(191) NOT NULL,
  `message` text NOT NULL,
  `direction` enum('OUTBOUND','INBOUND') NOT NULL DEFAULT 'OUTBOUND',
  `pieceJointeUrl` varchar(191) DEFAULT NULL,
  `pieceJointeNom` varchar(191) DEFAULT NULL,
  `externalMessageId` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `messagerie_fournisseur_threadId_idx` (`threadId`),
  KEY `messagerie_fournisseur_ticketId_idx` (`ticketId`),
  KEY `messagerie_fournisseur_equipmentId_idx` (`equipmentId`),
  KEY `messagerie_fournisseur_expediteurId_idx` (`expediteurId`),
  CONSTRAINT `messagerie_fournisseur_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `messagerie_fournisseur_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `materiels` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `messagerie_fournisseur_expediteurId_fkey` FOREIGN KEY (`expediteurId`) REFERENCES `utilisateurs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tickets_clotures` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ticketId` int(11) NOT NULL,
  `equipmentId` int(11) DEFAULT NULL,
  `clientName` varchar(191) DEFAULT NULL,
  `title` varchar(191) NOT NULL,
  `status` varchar(191) NOT NULL,
  `closedAt` datetime(3) DEFAULT NULL,
  `satisfactionRate` int(11) DEFAULT NULL,
  `summary` text DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tickets_clotures_ticketId_key` (`ticketId`),
  KEY `tickets_clotures_equipmentId_idx` (`equipmentId`),
  CONSTRAINT `tickets_clotures_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tickets_clotures_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `materiels` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `tickets_clotures` (`ticketId`, `equipmentId`, `clientName`, `title`, `status`, `closedAt`, `satisfactionRate`, `summary`)
SELECT t.`id`, t.`equipmentId`, COALESCE(t.`contactName`, m.`client`), t.`title`, t.`status`, t.`closedAt`, t.`satisfactionRate`, t.`solution`
FROM `tickets` t
LEFT JOIN `materiels` m ON m.`id` = t.`equipmentId`
WHERE t.`status` = 'CLOSED' OR t.`closedAt` IS NOT NULL;

INSERT INTO `messagerie_fournisseur` (`threadId`, `ticketId`, `equipmentId`, `expediteurId`, `fournisseur`, `fournisseurEmail`, `sujet`, `message`, `direction`, `pieceJointeUrl`, `pieceJointeNom`, `externalMessageId`, `createdAt`)
SELECT
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(h.`note`, '$.threadId')), CONCAT('historique:', h.`id`)),
  h.`ticketId`,
  h.`equipmentId`,
  h.`userId`,
  JSON_UNQUOTE(JSON_EXTRACT(h.`note`, '$.supplier')),
  JSON_UNQUOTE(JSON_EXTRACT(h.`note`, '$.supplierEmail')),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(h.`note`, '$.subject')), 'Conversation fournisseur'),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(h.`note`, '$.bodyText')), h.`note`),
  IF(JSON_UNQUOTE(JSON_EXTRACT(h.`note`, '$.direction')) = 'INBOUND', 'INBOUND', 'OUTBOUND'),
  NULL,
  NULL,
  JSON_UNQUOTE(JSON_EXTRACT(h.`note`, '$.gmailMessageId')),
  h.`createdAt`
FROM `historiques_sav` h
WHERE h.`action` IN ('SUPPLIER_EMAIL_SENT', 'SUPPLIER_EMAIL_RECEIVED') AND JSON_VALID(h.`note`);
