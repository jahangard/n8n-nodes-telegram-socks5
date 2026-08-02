/**
 * TelegramSocks5 — n8n community node
 *
 * Enhanced Telegram Bot API node with native SOCKS5 / HTTP proxy support.
 *
 * @author Mehdi Jahangard <mehdi.jahangard@gmail.com>
 * @license MIT
 */

import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import FormData from 'form-data';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionType, NodeOperationError } from 'n8n-workflow';

interface TelegramSocks5Credentials {
	botToken: string;
	useProxy: boolean;
	proxyType: 'socks5' | 'http';
	proxyHost: string;
	proxyPort: number;
	proxyUser?: string;
	proxyPassword?: string;
}

/**
 * Builds an Axios instance targeting the Telegram Bot API, optionally routed
 * through a SOCKS5 or HTTP proxy using the credentials supplied by the user.
 */
function createTelegramClient(credentials: TelegramSocks5Credentials): AxiosInstance {
	const baseURL = `https://api.telegram.org/bot${credentials.botToken}`;

	const axiosConfig: AxiosRequestConfig = {
		baseURL,
		timeout: 60000,
	};

	if (credentials.useProxy) {
		if (!credentials.proxyHost || !credentials.proxyPort) {
			throw new Error('Proxy Host and Proxy Port are required when "Use Proxy" is enabled.');
		}

		const auth =
			credentials.proxyUser && credentials.proxyPassword
				? `${encodeURIComponent(credentials.proxyUser)}:${encodeURIComponent(
						credentials.proxyPassword,
				  )}@`
				: '';

		if (credentials.proxyType === 'socks5') {
			const proxyUrl = `socks5h://${auth}${credentials.proxyHost}:${credentials.proxyPort}`;
			const agent = new SocksProxyAgent(proxyUrl);
			axiosConfig.httpAgent = agent;
			axiosConfig.httpsAgent = agent;
		} else {
			const proxyUrl = `http://${auth}${credentials.proxyHost}:${credentials.proxyPort}`;
			const agent = new HttpsProxyAgent(proxyUrl);
			axiosConfig.httpAgent = agent;
			axiosConfig.httpsAgent = agent;
		}

		// Ensure axios does not attempt to also apply its own proxy handling
		// on top of the injected agent.
		axiosConfig.proxy = false;
	}

	return axios.create(axiosConfig);
}

export class TelegramSocks5 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Telegram (SOCKS5 Proxy)',
		name: 'telegramSocks5',
		icon: 'file:telegramSocks5.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Enhanced Telegram node with native SOCKS5 / HTTP proxy support',
		defaults: {
			name: 'Telegram (SOCKS5 Proxy)',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'telegramSocks5Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Send Message',
						value: 'sendMessage',
						description: 'Send a text message to a chat',
						action: 'Send a text message',
					},
					{
						name: 'Send Photo',
						value: 'sendPhoto',
						description: 'Send a photo to a chat',
						action: 'Send a photo',
					},
					{
						name: 'Send Document',
						value: 'sendDocument',
						description: 'Send a document/file to a chat',
						action: 'Send a document',
					},
				],
				default: 'sendMessage',
			},

			// ---------------------------------------------------------------
			// Shared: Chat ID
			// ---------------------------------------------------------------
			{
				displayName: 'Chat ID',
				name: 'chatId',
				type: 'string',
				default: '',
				required: true,
				description:
					'Unique identifier for the target chat, or the @username of a public channel/group',
			},

			// ---------------------------------------------------------------
			// sendMessage
			// ---------------------------------------------------------------
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				displayOptions: {
					show: { operation: ['sendMessage'] },
				},
				description: 'Text of the message to be sent',
			},
			{
				displayName: 'Parse Mode',
				name: 'parseMode',
				type: 'options',
				options: [
					{ name: 'None', value: 'none' },
					{ name: 'Markdown', value: 'Markdown' },
					{ name: 'MarkdownV2', value: 'MarkdownV2' },
					{ name: 'HTML', value: 'HTML' },
				],
				default: 'none',
				displayOptions: {
					show: { operation: ['sendMessage'] },
				},
				description: 'How Telegram should parse the entities in the message text',
			},
			{
				displayName: 'Reply To Message ID',
				name: 'replyToMessageId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: { operation: ['sendMessage'] },
				},
				description: 'If set, the message will be sent as a reply to this message ID',
			},

			// ---------------------------------------------------------------
			// sendPhoto / sendDocument (shared source options)
			// ---------------------------------------------------------------
			{
				displayName: 'Binary Data',
				name: 'binaryData',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: { operation: ['sendPhoto', 'sendDocument'] },
				},
				description: 'Whether the data to upload should be taken from a binary property',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				displayOptions: {
					show: {
						operation: ['sendPhoto', 'sendDocument'],
						binaryData: [true],
					},
				},
				description: 'Name of the binary property that contains the file to upload',
			},
			{
				displayName: 'File URL',
				name: 'fileUrl',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['sendPhoto', 'sendDocument'],
						binaryData: [false],
					},
				},
				description: 'A remote HTTP URL or an already-uploaded Telegram file_id',
			},
			{
				displayName: 'Caption',
				name: 'caption',
				type: 'string',
				default: '',
				displayOptions: {
					show: { operation: ['sendPhoto', 'sendDocument'] },
				},
				description: 'Optional caption for the photo/document (0-1024 characters)',
			},

			// ---------------------------------------------------------------
			// Additional Fields
			// ---------------------------------------------------------------
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Disable Notification',
						name: 'disableNotification',
						type: 'boolean',
						default: false,
						description: 'Whether to send the message silently',
					},
					{
						displayName: 'Protect Content',
						name: 'protectContent',
						type: 'boolean',
						default: false,
						description: 'Whether to prevent forwarding/saving of the sent content',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = (await this.getCredentials(
			'telegramSocks5Api',
		)) as unknown as TelegramSocks5Credentials;

		let client: AxiosInstance;
		try {
			client = createTelegramClient(credentials);
		} catch (error) {
			throw new NodeOperationError(this.getNode(), (error as Error).message);
		}

		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const chatId = this.getNodeParameter('chatId', i) as string;
				const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

				let endpoint = '';
				let responseData: IDataObject;

				if (operation === 'sendMessage') {
					const text = this.getNodeParameter('text', i) as string;
					const parseMode = this.getNodeParameter('parseMode', i) as string;
					const replyToMessageId = this.getNodeParameter('replyToMessageId', i, 0) as number;

					endpoint = '/sendMessage';

					const body: IDataObject = {
						chat_id: chatId,
						text,
						...additionalFields,
					};

					if (parseMode !== 'none') {
						body.parse_mode = parseMode;
					}
					if (replyToMessageId) {
						body.reply_to_message_id = replyToMessageId;
					}

					const response = await client.post(endpoint, body);
					responseData = response.data as IDataObject;
				} else if (operation === 'sendPhoto' || operation === 'sendDocument') {
					const isBinary = this.getNodeParameter('binaryData', i) as boolean;
					const caption = this.getNodeParameter('caption', i, '') as string;
					const fieldName = operation === 'sendPhoto' ? 'photo' : 'document';
					endpoint = operation === 'sendPhoto' ? '/sendPhoto' : '/sendDocument';

					const form = new FormData();
					form.append('chat_id', chatId);
					if (caption) form.append('caption', caption);

					for (const [key, value] of Object.entries(additionalFields)) {
						form.append(
							key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
							String(value),
						);
					}

					if (isBinary) {
						const binaryPropertyName = this.getNodeParameter(
							'binaryPropertyName',
							i,
						) as string;
						const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

						form.append(fieldName, buffer, {
							filename: binaryData.fileName ?? 'file',
							contentType: binaryData.mimeType,
						});
					} else {
						const fileUrl = this.getNodeParameter('fileUrl', i) as string;
						if (!fileUrl) {
							throw new NodeOperationError(
								this.getNode(),
								'Either "Binary Data" must be enabled or a "File URL" must be provided.',
								{ itemIndex: i },
							);
						}
						form.append(fieldName, fileUrl);
					}

					const response = await client.post(endpoint, form, {
						headers: form.getHeaders(),
						maxContentLength: Infinity,
						maxBodyLength: Infinity,
					});
					responseData = response.data as IDataObject;
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported`,
						{ itemIndex: i },
					);
				}

				returnData.push({
					json: responseData,
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}

				if (axios.isAxiosError(error)) {
					const description =
						(error.response?.data as IDataObject)?.description ?? error.message;
					throw new NodeApiError(this.getNode(), (error.response?.data as any) ?? {}, {
						message: `Telegram API request failed: ${description}`,
						description: String(description),
						itemIndex: i,
					});
				}

				throw error;
			}
		}

		return [returnData];
	}
}
