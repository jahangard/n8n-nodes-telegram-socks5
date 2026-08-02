/**
 * TelegramSocks5Api — n8n credential type
 *
 * Stores the Telegram bot token plus SOCKS5/HTTP proxy connection settings
 * used by the TelegramSocks5 node.
 *
 * @author Mehdi Jahangard <mehdi.jahangard@gmail.com>
 * @license MIT
 */

import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TelegramSocks5Api implements ICredentialType {
	name = 'telegramSocks5Api';

	displayName = 'Telegram (SOCKS5/HTTP Proxy) API';

	documentationUrl = 'https://core.telegram.org/bots/api';

	icon = 'file:telegramSocks5.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName: 'Bot Token',
			name: 'botToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'The token of your Telegram bot, obtained from @BotFather',
		},
		{
			displayName: 'Use Proxy',
			name: 'useProxy',
			type: 'boolean',
			default: true,
			description: 'Whether to route all Telegram Bot API requests through a SOCKS5/HTTP proxy',
		},
		{
			displayName: 'Proxy Type',
			name: 'proxyType',
			type: 'options',
			options: [
				{ name: 'SOCKS5', value: 'socks5' },
				{ name: 'HTTP', value: 'http' },
			],
			default: 'socks5',
			displayOptions: {
				show: {
					useProxy: [true],
				},
			},
			description: 'The type of proxy to use for connecting to api.telegram.org',
		},
		{
			displayName: 'Proxy Host',
			name: 'proxyHost',
			type: 'string',
			default: '',
			placeholder: '127.0.0.1',
			displayOptions: {
				show: {
					useProxy: [true],
				},
			},
			description: 'Hostname or IP address of the proxy server',
		},
		{
			displayName: 'Proxy Port',
			name: 'proxyPort',
			type: 'number',
			default: 1080,
			displayOptions: {
				show: {
					useProxy: [true],
				},
			},
			description: 'Port of the proxy server',
		},
		{
			displayName: 'Proxy Username',
			name: 'proxyUser',
			type: 'string',
			default: '',
			required: false,
			displayOptions: {
				show: {
					useProxy: [true],
				},
			},
			description: 'Optional username for proxy authentication',
		},
		{
			displayName: 'Proxy Password',
			name: 'proxyPassword',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: false,
			displayOptions: {
				show: {
					useProxy: [true],
				},
			},
			description: 'Optional password for proxy authentication',
		},
	];

	// Standard n8n credential testing (via this.helpers request) does not route
	// through custom SOCKS5/HTTP agents, so this performs a direct, non-proxied
	// reachability check against the Bot API using the token only. The node
	// itself performs the real proxy-aware connectivity when it executes.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.telegram.org',
			url: '=/bot{{$credentials.botToken}}/getMe',
			method: 'GET',
		},
	};
}
