-- Renommage des tables existantes vers des noms francais metier.
RENAME TABLE
  `equipment` TO `equipements`,
  `sav_history` TO `historiques_sav`,
  `equipment_document` TO `documents_equipements`,
  `maintenance` TO `maintenances`,
  `reclamation` TO `reclamations`,
  `ticket` TO `tickets`,
  `user` TO `utilisateurs`,
  `purchase_order` TO `bons_achat`,
  `purchase_item` TO `lignes_bons_achat`,
  `part` TO `pieces_detachees`,
  `stock_movement` TO `mouvements_stock`;

-- Nouvelle structure dediee au ticketing interne.
CREATE TABLE `tickets_internes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `threadId` VARCHAR(191) NOT NULL,
  `ticketId` INTEGER NOT NULL,
  `destination` ENUM('ADV', 'MAGASINIER', 'ADMIN', 'TECHNICIAN') NOT NULL,
  `statut` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_REPLY', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  `sujet` VARCHAR(191) NOT NULL,
  `createurId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `tickets_internes_threadId_key`(`threadId`),
  INDEX `tickets_internes_ticketId_idx`(`ticketId`),
  INDEX `tickets_internes_createurId_idx`(`createurId`),
  INDEX `tickets_internes_destination_idx`(`destination`),
  INDEX `tickets_internes_statut_idx`(`statut`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `messages_tickets_internes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `ticketInterneId` INTEGER NOT NULL,
  `expediteurId` INTEGER NOT NULL,
  `type` ENUM('CREATE', 'MESSAGE', 'STATUS') NOT NULL DEFAULT 'MESSAGE',
  `message` TEXT NOT NULL,
  `statut` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_REPLY', 'RESOLVED') NOT NULL,
  `pieceJointeUrl` VARCHAR(191) NULL,
  `pieceJointeNom` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `messages_tickets_internes_ticketInterneId_idx`(`ticketInterneId`),
  INDEX `messages_tickets_internes_expediteurId_idx`(`expediteurId`),
  INDEX `messages_tickets_internes_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `tickets_internes`
  ADD CONSTRAINT `tickets_internes_ticketId_fkey`
    FOREIGN KEY (`ticketId`) REFERENCES `tickets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `tickets_internes_createurId_fkey`
    FOREIGN KEY (`createurId`) REFERENCES `utilisateurs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `messages_tickets_internes`
  ADD CONSTRAINT `messages_tickets_internes_ticketInterneId_fkey`
    FOREIGN KEY (`ticketInterneId`) REFERENCES `tickets_internes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `messages_tickets_internes_expediteurId_fkey`
    FOREIGN KEY (`expediteurId`) REFERENCES `utilisateurs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Suppression de l'ancienne table generique non utilisee.
DROP TABLE IF EXISTS `message`;
