/**
 * Server Management API Client
 * Handles all server-related API requests
 */

import { get, post, put, del, ApiError } from './client'

/**
 * Get list of all servers
 * @returns {Promise<Array>} List of servers
 */
export async function getServers() {
  return get('/api/servers')
}

/**
 * Get details for a specific server
 * @param {string|number} serverId - Server ID
 * @returns {Promise<Object>} Server details
 */
export async function getServer(serverId) {
  return get(`/api/servers/${serverId}`)
}

/**
 * Create a new server
 * @param {Object} serverData - Server configuration
 * @param {string} serverData.name - Server name
 * @param {string} serverData.version - Minecraft version
 * @param {string} serverData.loader - Mod loader (fabric, forge, etc.)
 * @param {number} serverData.port - Server port
 * @param {number} serverData.maxPlayers - Max players
 * @param {string} serverData.difficulty - Difficulty level
 * @param {string} serverData.gamemode - Default gamemode
 * @param {number} serverData.memory - Memory allocation in GB
 * @returns {Promise<Object>} Created server details
 */
export async function createServer(serverData) {
  return post('/api/servers', serverData)
}

/**
 * Update server settings
 * @param {string|number} serverId - Server ID
 * @param {Object} settings - Server settings to update
 * @returns {Promise<Object>} Updated server details
 */
export async function updateServerSettings(serverId, settings) {
  return put(`/api/servers/${serverId}/settings`, settings)
}

/**
 * Set a server's boot auto-start mode
 * @param {string|number} serverId - Server ID
 * @param {('always'|'never'|'last')} mode - Auto-start mode
 * @returns {Promise<Object>} Updated server details
 */
export async function setServerAutoStart(serverId, mode) {
  return put(`/api/servers/${serverId}/autostart`, { mode })
}

/**
 * Delete a server
 * @param {string|number} serverId - Server ID
 * @returns {Promise<Object>} Deletion confirmation
 */
export async function deleteServer(serverId) {
  return del(`/api/servers/${serverId}`)
}

/**
 * Start a server
 * @param {string|number} serverId - Server ID
 * @returns {Promise<Object>} Server start result
 */
export async function startServer(serverId) {
  return post(`/api/servers/${serverId}/start`)
}

/**
 * Stop a server
 * @param {string|number} serverId - Server ID
 * @returns {Promise<Object>} Server stop result
 */
export async function stopServer(serverId) {
  return post(`/api/servers/${serverId}/stop`)
}

/**
 * Restart a server
 * @param {string|number} serverId - Server ID
 * @returns {Promise<Object>} Server restart result
 */
export async function restartServer(serverId) {
  return post(`/api/servers/${serverId}/restart`)
}

/**
 * Browse server files
 * @param {string|number} serverId - Server ID
 * @param {Object} params - Query params
 * @param {string} params.path - Relative path inside the server directory
 * @returns {Promise<Object>} Current path and directory entries
 */
export async function browseServerFiles(serverId, params = {}) {
  return get(`/api/servers/${serverId}/files`, params)
}

/**
 * Search the server directory tree for files and folders by name
 * @param {string|number} serverId - Server ID
 * @param {Object} params - Query params
 * @param {string} params.q - Case-insensitive substring to match against names
 * @param {string} [params.path] - Relative subtree to search inside (defaults to the whole server)
 * @param {number} [params.limit] - Maximum number of hits to return
 * @returns {Promise<Object>} Matching entries plus a `truncated` flag
 */
export async function searchServerFiles(serverId, params = {}) {
  return get(`/api/servers/${serverId}/files/search`, params)
}

/**
 * Fetch a text file's contents
 * @param {string|number} serverId - Server ID
 * @param {string} path - Relative file path
 * @returns {Promise<Object>} File content payload
 */
export async function getServerFile(serverId, path) {
  return get(`/api/servers/${serverId}/files/content`, { path })
}

/**
 * Save a text file's contents
 * @param {string|number} serverId - Server ID
 * @param {string} path - Relative file path
 * @param {string} content - File contents
 * @returns {Promise<Object>} Save result
 */
export async function saveServerFile(serverId, path, content) {
  return put(`/api/servers/${serverId}/files/content`, { path, content })
}

/**
 * Upload one file into a directory under the server's install path.
 *
 * The raw File is the request body (not multipart) to match the backend's
 * streamed, size-capped upload routes. Callers upload one file per call and
 * fan out over a multi-select themselves, which is what keeps per-file
 * progress and per-file failure reporting possible.
 *
 * Uses XMLHttpRequest rather than fetch for the one thing fetch still can't
 * do: upload progress events. Same shape as `uploadWorld` in ./backups.js.
 *
 * @param {string|number} serverId
 * @param {string} dirPath - Relative destination folder ('' for the root)
 * @param {File} file
 * @param {object} [opts]
 * @param {boolean} [opts.overwrite] - Replace an existing file of that name
 * @param {(pct:number)=>void} [opts.onProgress] 0-100, or -1 when indeterminate
 * @param {(abort:()=>void)=>void} [opts.registerAbort] receives a cancel fn
 * @returns {Promise<Object>} `{ success, entry }`
 */
export function uploadServerFile(serverId, dirPath, file, { overwrite = false, onProgress, registerAbort } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    // encodeURIComponent matters more than it looks: a bare '+' in a query
    // string decodes to a space, which would rename every Fabric jar on the
    // way in (fabric-api-0.102.0+1.21.jar -> fabric-api-0.102.0 1.21.jar).
    const params = new URLSearchParams({ path: dirPath || '', filename: file.name })
    if (overwrite) params.set('overwrite', 'true')

    xhr.open('POST', `/api/servers/${serverId}/files/upload?${params.toString()}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')

    if (typeof registerAbort === 'function') {
      registerAbort(() => xhr.abort())
    }

    xhr.upload.onprogress = (event) => {
      if (typeof onProgress !== 'function') return
      onProgress(event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : -1)
    }

    xhr.onload = () => {
      let data = {}
      try {
        data = JSON.parse(xhr.responseText || '{}')
      } catch (_) {
        data = {}
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data)
      } else {
        reject(new ApiError(
          data.error || data.message || `Upload failed with status ${xhr.status}`,
          xhr.status,
          data && Object.keys(data).length ? data : null
        ))
      }
    }

    xhr.onerror = () => reject(new ApiError('Network error during upload', 0, null))
    xhr.onabort = () => reject(new ApiError('Upload cancelled', 0, null))

    xhr.send(file)
  })
}

/**
 * Delete one or more entries under the server's install path.
 *
 * Always answers 200 with `{ success, deleted, errors }` so a partial failure
 * in a multi-select reports per entry rather than sinking the batch. A
 * non-empty folder comes back in `errors` with `code: 'not-empty'` unless
 * `recursive` is set.
 *
 * @param {string|number} serverId
 * @param {string[]} paths - Relative paths
 * @param {object} [opts]
 * @param {boolean} [opts.recursive] - Allow deleting non-empty folders
 * @returns {Promise<{success:boolean, deleted:string[], errors:Array}>}
 */
export async function deleteServerFiles(serverId, paths, { recursive = false } = {}) {
  return del(`/api/servers/${serverId}/files`, { paths, recursive })
}

/**
 * Create a folder under the server's install path.
 * @param {string|number} serverId
 * @param {string} dirPath - Relative parent folder ('' for the root)
 * @param {string} name - New folder name
 * @returns {Promise<Object>} `{ success, entry }`
 */
export async function createServerFolder(serverId, dirPath, name) {
  return post(`/api/servers/${serverId}/files/folder`, { path: dirPath || '', name })
}

/**
 * Get server console logs
 * @param {string|number} serverId - Server ID
 * @param {Object} options - Log options
 * @param {number} options.limit - Number of log lines to retrieve
 * @returns {Promise<Object>} Server logs
 */
export async function getServerLogs(serverId, { limit = 1000 } = {}) {
  return get(`/api/servers/${serverId}/logs`, { limit })
}

/**
 * Send command to server console
 * @param {string|number} serverId - Server ID
 * @param {string} command - Console command to execute
 * @returns {Promise<Object>} Command execution result
 */
export async function sendServerCommand(serverId, command) {
  return post(`/api/servers/${serverId}/console`, { command })
}

/**
 * Get list of installed mods for a server
 * @param {string|number} serverId - Server ID
 * @returns {Promise<Array>} List of installed mods
 */
export async function getInstalledMods(serverId) {
  return get(`/api/servers/${serverId}/mods`)
}

/**
 * Remove a mod from the server
 * @param {string|number} serverId - Server ID
 * @param {string} modName - Mod name or filename
 * @returns {Promise<Object>} Removal result
 */
export async function removeMod(serverId, modName) {
  return del(`/api/servers/${serverId}/mods/${encodeURIComponent(modName)}`)
}

/**
 * Remove multiple mods from the server in one request
 * @param {string|number} serverId - Server ID
 * @param {string[]} filenames - Array of mod filenames to remove
 * @returns {Promise<Object>} Bulk removal result with deleted/errors arrays
 */
export async function bulkRemoveMods(serverId, filenames) {
  return del(`/api/servers/${serverId}/mods`, { filenames })
}

/**
 * Get server performance metrics
 * @param {string|number} serverId - Server ID
 * @returns {Promise<Object>} Performance metrics (CPU, RAM, TPS, etc.)
 */
export async function getServerMetrics(serverId) {
  return get(`/api/servers/${serverId}/metrics`)
}

/**
 * Install a server (download files, write configs)
 * @param {string|number} serverId - Server ID
 * @returns {Promise<Object>} Installation result
 */
export async function installServer(serverId, { modpack = null } = {}) {
  // A modpack passed here is installed by the same backend worker that
  // installs the loader, so closing the screen or refreshing no longer loses
  // it (#63). Omit it and the install is loader-only, as before.
  return post(`/api/servers/${serverId}/install`, modpack ? { modpack } : {})
}

/**
 * Get the current install progress for a server.
 * Returns { active: bool, phase?: string, bytes_done?: number, bytes_total?: number, error?: string, ... }.
 * @param {string} serverId
 * @returns {Promise<Object>}
 */
export async function getServerInstallProgress(serverId) {
  return get(`/api/servers/${encodeURIComponent(serverId)}/install/progress`)
}

/**
 * Create a mandatory snapshot and upgrade a Vanilla or Paper server release.
 * The returned job uses the normal install-progress endpoint for polling.
 * @param {string|number} serverId
 * @param {string} version Target Minecraft release, newer than the current one
 * @returns {Promise<Object>} Upgrade job state
 */
export async function upgradeServer(serverId, version) {
  return post(`/api/servers/${encodeURIComponent(serverId)}/upgrade`, { version })
}

/**
 * Get Minecraft versions supported by a loader.
 * @param {string} loader - Loader name (e.g. 'fabric', 'vanilla')
 * @returns {Promise<Array<{version: string, stable: boolean, type?: string}>>}
 */
export async function getLoaderGameVersions(loader) {
  return get(`/api/loaders/${encodeURIComponent(loader)}/versions/game`)
}

/**
 * Get loader-specific versions for a Minecraft version.
 * @param {string} loader - Loader name
 * @param {string} [mcVersion] - Minecraft version filter
 * @returns {Promise<Array>} Loader-native version metadata (shape varies by loader)
 */
export async function getLoaderVersions(loader, mcVersion) {
  const params = mcVersion ? { mc_version: mcVersion } : {}
  return get(`/api/loaders/${encodeURIComponent(loader)}/versions/loader`, params)
}

/**
 * Get overall system metrics (CPU, memory)
 * @returns {Promise<Object>} System metrics payload
 */
export async function getSystemMetrics() {
  return get('/api/metrics/system')
}

/**
 * Get Java installation status and platform download URL
 * @param {Object} options
 * @param {string} options.mcVersion - Optional Minecraft version to resolve required Java.
 * @param {number} options.requiredJava - Optional forced required Java version.
 * @param {string} options.javaPath - Optional java executable/path to check.
 * @returns {Promise<Object>} Java runtime and recommendation payload
 */
export async function getJavaStatus(options = {}) {
  const params = {}
  if (options.mcVersion) {
    params.mc_version = options.mcVersion
  }
  if (options.requiredJava) {
    params.required_java = options.requiredJava
  }
  if (options.javaPath) {
    params.java_path = options.javaPath
  }
  return get('/api/java/status', params)
}

/**
 * Start a managed Java install for the given major version.
 * @param {number} major - Java major version to install (e.g. 21)
 * @returns {Promise<Object>} Task descriptor including task_id
 */
export async function installJava(major) {
  return post('/api/java/install', { major })
}

/**
 * Poll a managed Java install task for progress.
 * @param {string} taskId - Task id returned by installJava()
 * @returns {Promise<Object>} Current task status and bytes-downloaded
 */
export async function getJavaInstallProgress(taskId) {
  return get(`/api/java/install/progress/${taskId}`)
}

/**
 * List installed Java runtimes (managed installs plus the system Java probe).
 * @returns {Promise<Object>} { managed: Array<{major, path, version}>, system: {path, version, installed} }
 */
export async function getInstalledJava() {
  return get('/api/java/installed')
}

/**
 * Remove a managed Java runtime by major version.
 * @param {number} major - Managed Java major version to remove
 * @returns {Promise<Object>} { success, major }
 */
export async function uninstallJava(major) {
  return del(`/api/java/installed/${major}`)
}

/**
 * Get Fabricator self-update status.
 * @returns {Promise<Object>} Update state and latest-version information
 */
export async function getUpdateStatus() {
  return get('/api/system/update/status')
}

/**
 * Trigger Fabricator self-update.
 * @param {string} version - Optional target version (default latest)
 * @returns {Promise<Object>} Update start result
 */
export async function triggerUpdate(version = 'latest') {
  return post('/api/system/update', { version })
}
