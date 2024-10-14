import { Duplex } from 'stream'
import { Client } from 'ssh2'
import Docker from 'dockerode'
import config, { getQuestImage } from '../config.js'
import logger from '../utils/logger.js'

const engine = new Docker()

const newContainerOptions = (
  name: string,
  imageId: string,
  options: {
    binds?: string[]
  } = {}
): Docker.ContainerCreateOptions => ({
  name,
  Image: getQuestImage(imageId),
  HostConfig: {
    NetworkMode: config.docker.network,
    Binds: options.binds,
    ExtraHosts: ['host.docker.internal:host-gateway'],
  },
  ExposedPorts: {
    '22/tcp': {},
  },
})

export function createContainer(
  name: string,
  imageId: string
): Promise<Docker.Container> {
  let binds: string[] = [
    `${config.projectRoot}/config/ssh_key.pub:/ssh_key.pub:ro`,
    `${config.projectRoot}/quests/entrypoint.sh:/entrypoint.sh:ro`,
  ]
  if (!config.isProduction && config.docker.mountQuest && imageId !== 'base') {
    logger.info('Mounting quest folder', imageId)
    binds = [
      `${config.projectRoot}/quests/${imageId}/home:/home/commander`,
      `${config.projectRoot}/packages/container:/usr/local/lib/container`,
    ]
  }
  const option = newContainerOptions(name, imageId, { binds })
  return engine.createContainer(option)
}

export async function getAndStartContainer(
  id: string
): Promise<Docker.Container> {
  logger.debug(`Getting container: ${id}`)
  const container = engine.getContainer(id)
  if (!container) {
    throw new Error(`Container ${id} not found`)
  }
  if (!(await container.inspect()).State.Running) {
    await container.start()
  }
  await new Promise((resolve) => {
    setTimeout(resolve, 2000)
  })
  return container
}

export async function attachContainer(
  container: Docker.Container,
  { token }: { token: string }
): Promise<Duplex> {
  const containerIp = (await container.inspect()).NetworkSettings.Networks[
    config.docker.network
  ].IPAddress
  const conn = new Client()
  console.log(config.docker.keypair.privateKey)

  return new Promise((resolve, reject) => {
    conn
      .on('ready', () => {
        console.log('SSH connection ready')
        conn.shell(
          {
            env: {
              TOKEN: token,
              API_ENDPOINT: 'http://host.docker.internal:3000',
              ZDOTDIR: '/etc/zsh',
              NODE_PATH: '/usr/src/node_modules',
            },
          },
          (err, stream) => {
            if (err) {
              reject(err)
            }
            stream.on('close', () => {
              console.log('Stream :: close')
              conn.end()
            })
            resolve(stream)
          }
        )
      })
      .on('error', (err) => {
        reject(err)
      })
      .connect({
        host: containerIp,
        port: 22,
        username: 'commander',
        privateKey: config.docker.keypair.privateKey,
        debug: console.log,
      })
  })
}

export async function deleteContainer(id: string) {
  const container = engine.getContainer(id)
  if (!container) {
    return
  }
  try {
    await container.stop()
  } catch {
    logger.warn('Failed to stop container', id)
  }
  await container.remove()
}

function parseJSONOutput(data: string) {
  const { stream, error } = JSON.parse(data)
  if (stream) {
    // eslint-disable-next-line no-console
    console.log(stream)
  }
  if (error) {
    throw error
  }
}

export function buildQuestImage(questPath: string, questId: string) {
  return new Promise((resolve, reject) => {
    engine.buildImage(
      {
        context: questPath,
        src: ['Dockerfile', 'home'],
      },
      {
        t: getQuestImage(questId),
        networkmode: 'none',
        memory: 10 * 1e6,
      },
      (err, response) => {
        if (err) {
          reject(err)
        }
        if (response) {
          response.on('data', (data) => {
            // Process the data (this could be Docker build output)
            try {
              data
                .toString()
                .split('\n')
                .map((line: string) => line.trim())
                .filter((line: string) => line !== '')
                .forEach((line: string) => {
                  parseJSONOutput(line)
                })
            } catch (error) {
              reject(error)
            }
          })

          response.on('end', () => {
            logger.info(`Build completed for ${questId}`)
            resolve(questId)
          })

          response.on('error', (error) => {
            logger.error(`Build failed for ${questId}:`, error)
            reject(error)
          })
        }
      }
    )
  })
}
