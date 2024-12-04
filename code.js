"use strict";
// Dieses Plugin ermöglicht es, Variablengruppen als Alias miteinander zu verknüpfen
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Zeige die HTML-UI an
figma.showUI(__html__, { width: 400, height: 600 });
// Hilfsfunktion zum Abrufen aller Variablen-Collections
function getVariableCollections() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Rufe Collections ab...");
        const collections = yield figma.variables.getLocalVariableCollectionsAsync();
        console.log("Gefundene Collections:", collections);
        const collectionInfos = collections.map(collection => ({
            id: collection.id,
            name: collection.name,
            modes: collection.modes.map(mode => ({
                modeId: mode.modeId,
                name: mode.name
            }))
        }));
        console.log("Aufbereitete Collections:", collectionInfos);
        return collectionInfos;
    });
}
// Hilfsfunktion zum Extrahieren der Gruppe aus dem Variablennamen
function extractGroupPath(variableName) {
    const lastSlashIndex = variableName.lastIndexOf('/');
    if (lastSlashIndex === -1)
        return variableName;
    // Gib den vollständigen Pfad ohne den letzten Teil zurück
    return variableName.substring(0, lastSlashIndex);
}
// Hilfsfunktion zum Abrufen aller Variablengruppen einer Collection
function getVariableGroups(collection) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Rufe Gruppen für Collection ab:", collection.name);
        console.log("Collection hat", collection.variableIds.length, "Variablen");
        const variablePromises = collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id));
        const variables = yield Promise.all(variablePromises);
        console.log("Alle Variablen geladen");
        const groups = new Set(variables
            .filter((variable) => {
            if (!variable) {
                console.log("Variable ist null");
                return false;
            }
            console.log("Verarbeite Variable:", variable.name);
            return true;
        })
            .map(variable => {
            const groupPath = extractGroupPath(variable.name);
            console.log("Extrahierter Gruppenpfad:", groupPath, "aus", variable.name);
            return groupPath;
        }));
        const groupArray = Array.from(groups).sort();
        console.log("Gefundene Gruppen:", groupArray);
        return groupArray;
    });
}
// Hilfsfunktion zum Abrufen aller Variablen einer Gruppe
function getVariablesInGroup(collection, groupPath) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Rufe Variablen für Gruppe ab:", groupPath);
        const variablePromises = collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id));
        const variables = yield Promise.all(variablePromises);
        return variables.filter((variable) => {
            if (!variable)
                return false;
            const currentGroupPath = extractGroupPath(variable.name);
            const matches = currentGroupPath === groupPath;
            console.log("Prüfe Variable:", variable.name, "Gruppe:", currentGroupPath, "Matches:", matches);
            return matches;
        });
    });
}
// Hilfsfunktion zum Überprüfen des Variablentyps
function isVariableAlias(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return obj.type === 'VARIABLE_ALIAS';
}
// Hauptlogik für die Nachrichtenverarbeitung
figma.ui.onmessage = (msg) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Nachricht empfangen:", msg);
    try {
        if (msg.type === 'get-collections') {
            console.log("Hole Collections...");
            const collections = yield getVariableCollections();
            console.log("Sende Collections an UI:", collections);
            figma.ui.postMessage({
                type: 'collections',
                collections: collections
            });
        }
        else if (msg.type === 'get-groups') {
            const collections = yield figma.variables.getLocalVariableCollectionsAsync();
            let collection;
            if (msg.sourceCollectionId) {
                collection = collections.find(c => c.id === msg.sourceCollectionId);
                console.log("Suche Gruppen für Quell-Collection:", collection === null || collection === void 0 ? void 0 : collection.name);
            }
            else if (msg.targetCollectionId) {
                collection = collections.find(c => c.id === msg.targetCollectionId);
                console.log("Suche Gruppen für Ziel-Collection:", collection === null || collection === void 0 ? void 0 : collection.name);
            }
            if (collection) {
                const groups = yield getVariableGroups(collection);
                console.log("Sende Gruppen an UI:", groups);
                figma.ui.postMessage({
                    type: 'groups',
                    groups: groups,
                    forTarget: !!msg.targetCollectionId
                });
            }
            else {
                console.log("Keine Collection gefunden");
                figma.ui.postMessage({
                    type: 'error',
                    message: 'Collection nicht gefunden'
                });
            }
        }
        else if (msg.type === 'create-aliases' && msg.sourceCollectionId && msg.targetCollectionId &&
            msg.modeId && msg.sourceGroup && msg.targetGroup) {
            console.log("Erstelle Aliase...");
            const collections = yield figma.variables.getLocalVariableCollectionsAsync();
            const sourceCollection = collections.find(c => c.id === msg.sourceCollectionId);
            const targetCollection = collections.find(c => c.id === msg.targetCollectionId);
            if (!sourceCollection || !targetCollection) {
                throw new Error('Eine oder beide Collections wurden nicht gefunden');
            }
            const sourceVars = yield getVariablesInGroup(sourceCollection, msg.sourceGroup);
            const targetVars = yield getVariablesInGroup(targetCollection, msg.targetGroup);
            console.log("Quellvariablen:", sourceVars.map(v => v.name));
            console.log("Zielvariablen:", targetVars.map(v => v.name));
            if (sourceVars.length !== targetVars.length) {
                throw new Error('Die Gruppen haben nicht die gleiche Anzahl an Variablen');
            }
            // Erstelle Aliase
            for (let i = 0; i < sourceVars.length; i++) {
                const aliasValue = {
                    type: 'VARIABLE_ALIAS',
                    id: sourceVars[i].id
                };
                targetVars[i].setValueForMode(msg.modeId, aliasValue);
            }
            figma.ui.postMessage({
                type: 'success',
                message: 'Aliase erfolgreich erstellt'
            });
        }
        else if (msg.type === 'remove-aliases' && msg.targetCollectionId && msg.modeId && msg.targetGroup) {
            console.log("Entferne Aliase...");
            const collections = yield figma.variables.getLocalVariableCollectionsAsync();
            const targetCollection = collections.find(c => c.id === msg.targetCollectionId);
            if (!targetCollection) {
                throw new Error('Collection nicht gefunden');
            }
            const targetVars = yield getVariablesInGroup(targetCollection, msg.targetGroup);
            // Entferne Aliase
            for (const variable of targetVars) {
                const value = variable.valuesByMode[msg.modeId];
                if (isVariableAlias(value)) {
                    // Hole den ursprünglichen Wert der Quellvariable
                    const sourceVar = yield figma.variables.getVariableByIdAsync(value.id);
                    if (sourceVar) {
                        const sourceValue = sourceVar.valuesByMode[msg.modeId];
                        // Setze den gleichen Wert wie die Quellvariable
                        variable.setValueForMode(msg.modeId, sourceValue);
                    }
                }
            }
            figma.ui.postMessage({
                type: 'success',
                message: 'Aliase erfolgreich entfernt'
            });
        }
    }
    catch (error) {
        console.error("Fehler:", error);
        figma.ui.postMessage({
            type: 'error',
            message: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten'
        });
    }
});
