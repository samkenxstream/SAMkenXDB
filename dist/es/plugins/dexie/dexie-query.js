import { dexieReplaceIfStartsWithPipe, DEXIE_DOCS_TABLE_NAME, fromDexieToStorage } from './dexie-helper';
import { RxStorageDexieStatics } from './rx-storage-dexie';

/**
 * Runs mango queries over the Dexie.js database.
 */
export var dexieQuery = function dexieQuery(instance, preparedQuery) {
  try {
    return Promise.resolve(instance.internals).then(function (state) {
      var query = preparedQuery.query;
      var queryMatcher = RxStorageDexieStatics.getQueryMatcher(instance.schema, preparedQuery);
      var sortComparator = RxStorageDexieStatics.getSortComparator(instance.schema, preparedQuery);
      var skip = query.skip ? query.skip : 0;
      var limit = query.limit ? query.limit : Infinity;
      var skipPlusLimit = skip + limit;
      var queryPlan = preparedQuery.queryPlan;
      var keyRange = getKeyRangeByQueryPlan(queryPlan, state.dexieDb._options.IDBKeyRange);
      var queryPlanFields = queryPlan.index;
      var rows = [];
      return Promise.resolve(state.dexieDb.transaction('r', state.dexieTable, function (dexieTx) {
        try {
          /**
           * TODO here we use the native IndexedDB transaction
           * to get the cursor.
           * Instead we should not leave Dexie.js API and find
           * a way to create the cursor with Dexie.js.
           */
          var tx = dexieTx.idbtrans; // const nativeIndexedDB = state.dexieDb.backendDB();
          // const trans = nativeIndexedDB.transaction([DEXIE_DOCS_TABLE_NAME], 'readonly');

          var store = tx.objectStore(DEXIE_DOCS_TABLE_NAME);
          var index;

          if (queryPlanFields.length === 1 && queryPlanFields[0] === instance.primaryPath) {
            index = store;
          } else {
            var indexName;

            if (queryPlanFields.length === 1) {
              indexName = dexieReplaceIfStartsWithPipe(queryPlanFields[0]);
            } else {
              indexName = '[' + queryPlanFields.map(function (field) {
                return dexieReplaceIfStartsWithPipe(field);
              }).join('+') + ']';
            }

            index = store.index(indexName);
          }

          var cursorReq = index.openCursor(keyRange);
          return Promise.resolve(new Promise(function (res) {
            cursorReq.onsuccess = function (e) {
              var cursor = e.target.result;

              if (cursor) {
                // We have a record in cursor.value
                var docData = fromDexieToStorage(cursor.value);

                if (queryMatcher(docData)) {
                  rows.push(docData);
                }
                /**
                 * If we do not have to manually sort
                 * and have enough documents,
                 * we can abort iterating over the cursor
                 * because we already have every relevant document.
                 */


                if (queryPlan.sortFieldsSameAsIndexFields && rows.length === skipPlusLimit) {
                  res();
                } else {
                  cursor["continue"]();
                }
              } else {
                // Iteration complete
                res();
              }
            };
          })).then(function () {});
        } catch (e) {
          return Promise.reject(e);
        }
      })).then(function () {
        if (!queryPlan.sortFieldsSameAsIndexFields) {
          rows = rows.sort(sortComparator);
        } // apply skip and limit boundaries.


        rows = rows.slice(skip, skipPlusLimit);
        /**
         * Comment this in for debugging to check all fields in the database.
         */
        // const docsInDb = await state.dexieTable.filter(queryMatcher).toArray();
        // let documents = docsInDb
        //     .map(docData => stripDexieKey(docData))
        //     .sort(sortComparator);
        // if (preparedQuery.skip) {
        //     documents = documents.slice(preparedQuery.skip);
        // }
        // if (preparedQuery.limit && documents.length > preparedQuery.limit) {
        //     documents = documents.slice(0, preparedQuery.limit);
        // }

        return {
          documents: rows
        };
      });
    });
  } catch (e) {
    return Promise.reject(e);
  }
};
export function getKeyRangeByQueryPlan(queryPlan, IDBKeyRange) {
  if (!IDBKeyRange) {
    if (typeof window === 'undefined') {
      throw new Error('IDBKeyRange missing');
    } else {
      IDBKeyRange = window.IDBKeyRange;
    }
  }
  /**
   * If index has only one field,
   * we have to pass the keys directly, not the key arrays.
   */


  if (queryPlan.index.length === 1) {
    return IDBKeyRange.bound(queryPlan.startKeys[0], queryPlan.endKeys[0], queryPlan.inclusiveStart, queryPlan.inclusiveEnd);
  }

  return IDBKeyRange.bound(queryPlan.startKeys, queryPlan.endKeys, queryPlan.inclusiveStart, queryPlan.inclusiveEnd);
}
//# sourceMappingURL=dexie-query.js.map