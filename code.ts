// Dieses Plugin ermöglicht es, Variablengruppen als Alias miteinander zu verknüpfen

interface PluginMessage {
  type: string;
  sourceCollectionId?: string;
  targetCollectionId?: string;
  modeId?: string;
  sourceGroup?: string;
  targetGroup?: string;
}

interface CollectionInfo {
  id: string;
  name: string;
  modes: { modeId: string; name: string; }[];
}

// Zeige die HTML-UI an
figma.showUI(__html__, { width: 400, height: 600 });

// Hilfsfunktion zum Abrufen aller Variablen-Collections
async function getVariableCollections(): Promise<CollectionInfo[]> {
  console.log("Rufe Collections ab...");
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
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
}

// Hilfsfunktion zum Extrahieren der Gruppe aus dem Variablennamen
function extractGroupPath(variableName: string): string {
  const lastSlashIndex = variableName.lastIndexOf('/');
  if (lastSlashIndex === -1) return variableName;
  
  // Gib den vollständigen Pfad ohne den letzten Teil zurück
  return variableName.substring(0, lastSlashIndex);
}

// Hilfsfunktion zum Abrufen aller Variablengruppen einer Collection
async function getVariableGroups(collection: VariableCollection): Promise<string[]> {
  console.log("Rufe Gruppen für Collection ab:", collection.name);
  console.log("Collection hat", collection.variableIds.length, "Variablen");
  
  const variablePromises = collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id));
  const variables = await Promise.all(variablePromises);
  
  console.log("Alle Variablen geladen");
  
  const groups = new Set(variables
    .filter((variable): variable is Variable => {
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
}

// Hilfsfunktion zum Abrufen aller Variablen einer Gruppe
async function getVariablesInGroup(collection: VariableCollection, groupPath: string): Promise<Variable[]> {
  console.log("Rufe Variablen für Gruppe ab:", groupPath);
  const variablePromises = collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id));
  const variables = await Promise.all(variablePromises);
  
  return variables.filter((variable): variable is Variable => {
    if (!variable) return false;
    const currentGroupPath = extractGroupPath(variable.name);
    const matches = currentGroupPath === groupPath;
    console.log("Prüfe Variable:", variable.name, "Gruppe:", currentGroupPath, "Matches:", matches);
    return matches;
  });
}

// Hilfsfunktion zum Überprüfen des Variablentyps
function isVariableAlias(value: VariableValue): value is VariableAlias {
  if (!value || typeof value !== 'object') {
    return false;
  }
  
  const obj = value as { type?: string };
  return obj.type === 'VARIABLE_ALIAS';
}

// Hauptlogik für die Nachrichtenverarbeitung
figma.ui.onmessage = async (msg: PluginMessage) => {
  console.log("Nachricht empfangen:", msg);
  
  try {
    if (msg.type === 'get-collections') {
      console.log("Hole Collections...");
      const collections = await getVariableCollections();
      console.log("Sende Collections an UI:", collections);
      figma.ui.postMessage({ 
        type: 'collections',
        collections: collections
      });
    }
    
    else if (msg.type === 'get-groups') {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      let collection: VariableCollection | undefined;
      
      if (msg.sourceCollectionId) {
        collection = collections.find(c => c.id === msg.sourceCollectionId);
        console.log("Suche Gruppen für Quell-Collection:", collection?.name);
      } else if (msg.targetCollectionId) {
        collection = collections.find(c => c.id === msg.targetCollectionId);
        console.log("Suche Gruppen für Ziel-Collection:", collection?.name);
      }
      
      if (collection) {
        const groups = await getVariableGroups(collection);
        console.log("Sende Gruppen an UI:", groups);
        figma.ui.postMessage({ 
          type: 'groups',
          groups: groups,
          forTarget: !!msg.targetCollectionId
        });
      } else {
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
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const sourceCollection = collections.find(c => c.id === msg.sourceCollectionId);
      const targetCollection = collections.find(c => c.id === msg.targetCollectionId);
      
      if (!sourceCollection || !targetCollection) {
        throw new Error('Eine oder beide Collections wurden nicht gefunden');
      }
      
      const sourceVars = await getVariablesInGroup(sourceCollection, msg.sourceGroup);
      const targetVars = await getVariablesInGroup(targetCollection, msg.targetGroup);
      
      console.log("Quellvariablen:", sourceVars.map(v => v.name));
      console.log("Zielvariablen:", targetVars.map(v => v.name));
      
      if (sourceVars.length !== targetVars.length) {
        throw new Error('Die Gruppen haben nicht die gleiche Anzahl an Variablen');
      }
      
      // Erstelle Aliase
      for (let i = 0; i < sourceVars.length; i++) {
        const aliasValue: VariableAlias = {
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
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const targetCollection = collections.find(c => c.id === msg.targetCollectionId);
      
      if (!targetCollection) {
        throw new Error('Collection nicht gefunden');
      }
      
      const targetVars = await getVariablesInGroup(targetCollection, msg.targetGroup);
      
      // Entferne Aliase
      for (const variable of targetVars) {
        const value = variable.valuesByMode[msg.modeId];
        if (isVariableAlias(value)) {
          // Hole den ursprünglichen Wert der Quellvariable
          const sourceVar = await figma.variables.getVariableByIdAsync(value.id);
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
  } catch (error) {
    console.error("Fehler:", error);
    figma.ui.postMessage({ 
      type: 'error',
      message: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten'
    });
  }
};
