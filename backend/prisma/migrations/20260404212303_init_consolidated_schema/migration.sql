-- CreateTable
CREATE TABLE `equipment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `serialNumber` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `status` ENUM('OPERATIONAL', 'DOWN_AT_CLIENT', 'IN_WORKSHOP', 'ON_LOAN', 'REPLACED', 'RETIRED', 'MAINTENANCE_REQUIRED') NOT NULL DEFAULT 'OPERATIONAL',
    `purchaseDate` DATETIME(3) NULL,
    `lastMaintenance` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `client` VARCHAR(191) NULL,
    `code` VARCHAR(191) NULL,
    `criticality` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'LOW',
    `service` VARCHAR(191) NULL,
    `blDate` DATETIME(3) NULL,
    `warrantyMonths` INTEGER NULL,
    `agence` VARCHAR(191) NULL,
    `blNumber` VARCHAR(191) NULL,
    `blDocumentUrl` VARCHAR(191) NULL,
    `invoiceUrl` VARCHAR(191) NULL,

    UNIQUE INDEX `Equipment_serialNumber_key`(`serialNumber`),
    UNIQUE INDEX `Equipment_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sav_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipmentId` INTEGER NOT NULL,
    `ticketId` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sav_history_equipmentId_idx`(`equipmentId`),
    INDEX `sav_history_userId_idx`(`userId`),
    INDEX `sav_history_ticketId_idx`(`ticketId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `equipment_document` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipmentId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uploadedBy` INTEGER NOT NULL,

    INDEX `equipment_document_equipmentId_idx`(`equipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipmentId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `scheduledDate` DATETIME(3) NOT NULL,
    `completedDate` DATETIME(3) NULL,
    `technicianId` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PLANNED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Maintenance_equipmentId_fkey`(`equipmentId`),
    INDEX `Maintenance_technicianId_fkey`(`technicianId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reclamation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerName` VARCHAR(191) NOT NULL,
    `contactEmail` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `serialNumber` VARCHAR(191) NOT NULL,
    `deviceModel` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('OPEN', 'QUALIFICATION', 'DIAGNOSTIC', 'DECISION', 'PENDING_PARTS', 'REPAIR', 'QUALITY_TEST', 'READY_FOR_DELIVERY', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `equipmentId` INTEGER NOT NULL,
    `creatorId` INTEGER NOT NULL,
    `assignedToId` INTEGER NULL,
    `advId` INTEGER NULL,
    `aiDiagnosis` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `diagnosis` TEXT NULL,
    `solution` TEXT NULL,
    `isUnderWarranty` BOOLEAN NOT NULL DEFAULT false,
    `estimatedEndDate` DATETIME(3) NULL,
    `estimatedDuration` INTEGER NULL,
    `actualDuration` INTEGER NULL,
    `closedAt` DATETIME(3) NULL,

    INDEX `Ticket_assignedToId_fkey`(`assignedToId`),
    INDEX `Ticket_creatorId_fkey`(`creatorId`),
    INDEX `Ticket_equipmentId_fkey`(`equipmentId`),
    INDEX `Ticket_advId_fkey`(`advId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'TECHNICIAN', 'CLIENT', 'ADV', 'MAGASINIER', 'ACHATS') NOT NULL DEFAULT 'CLIENT',
    `phone` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ref` VARCHAR(191) NOT NULL,
    `supplier` VARCHAR(191) NOT NULL,
    `supplierContact` VARCHAR(191) NULL,
    `sourceType` ENUM('LOCAL', 'IMPORT', 'PLATFORM', 'FABRICATION') NOT NULL DEFAULT 'LOCAL',
    `status` ENUM('DEMAND', 'QUOTATION', 'ORDERED', 'SHIPPED', 'RECEIVED', 'CHECKED', 'CONSUMED') NOT NULL DEFAULT 'DEMAND',
    `totalAmount` DOUBLE NOT NULL DEFAULT 0,
    `expectedDate` DATETIME(3) NULL,
    `receivedDate` DATETIME(3) NULL,
    `trackingNumber` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `creatorId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchase_order_ref_key`(`ref`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `ref` VARCHAR(191) NULL,
    `qty` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DOUBLE NOT NULL DEFAULT 0,
    `ticketId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `part` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sageCode` VARCHAR(191) NULL,
    `sageDesignation` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `price` DOUBLE NOT NULL DEFAULT 0,
    `quantityInStock` INTEGER NOT NULL DEFAULT 0,
    `minStock` INTEGER NOT NULL DEFAULT 5,
    `compatibleModels` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `part_sageCode_key`(`sageCode`),
    UNIQUE INDEX `part_reference_key`(`reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_movement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `partId` INTEGER NOT NULL,
    `type` ENUM('RECEPTION', 'SORTIE') NOT NULL,
    `qty` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ref` VARCHAR(191) NULL,
    `userId` INTEGER NOT NULL,
    `supplier` VARCHAR(191) NULL,
    `sourceType` ENUM('LOCAL', 'IMPORT', 'PLATFORM', 'FABRICATION') NULL,
    `documentUrl` VARCHAR(191) NULL,
    `ticketId` INTEGER NULL,
    `technicianId` INTEGER NULL,

    INDEX `stock_movement_partId_idx`(`partId`),
    INDEX `stock_movement_ticketId_idx`(`ticketId`),
    INDEX `stock_movement_technicianId_idx`(`technicianId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sav_history` ADD CONSTRAINT `sav_history_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sav_history` ADD CONSTRAINT `sav_history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sav_history` ADD CONSTRAINT `sav_history_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `ticket`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_document` ADD CONSTRAINT `equipment_document_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_document` ADD CONSTRAINT `equipment_document_uploadedBy_fkey` FOREIGN KEY (`uploadedBy`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance` ADD CONSTRAINT `Maintenance_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance` ADD CONSTRAINT `Maintenance_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket` ADD CONSTRAINT `Ticket_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket` ADD CONSTRAINT `Ticket_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket` ADD CONSTRAINT `Ticket_advId_fkey` FOREIGN KEY (`advId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket` ADD CONSTRAINT `Ticket_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_item` ADD CONSTRAINT `purchase_item_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `purchase_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_item` ADD CONSTRAINT `purchase_item_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `ticket`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_partId_fkey` FOREIGN KEY (`partId`) REFERENCES `part`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `ticket`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
