import {
  NetworkId,
  TokenTransaction,
  TokenTransactionTypeV2,
  TransactionStatus,
} from 'src/transactions/types'
import { groupFeedItemsInSections } from 'src/transactions/utils'
import { mockCusdAddress, mockCusdTokenId } from 'test/values'

const mockFeedItem = (timestamp: number, status = TransactionStatus.Complete): TokenTransaction => {
  return {
    networkId: NetworkId['celo-sepolia'],
    type: TokenTransactionTypeV2.Sent,
    block: '8648978',
    transactionHash: 'any_value',
    amount: {
      value: '5.05',
      tokenAddress: mockCusdAddress,
      tokenId: mockCusdTokenId,
      localAmount: undefined,
    },
    fees: [],
    timestamp,
    address: '0xanything',
    status,
    metadata: {},
  }
}

const sept172019Timestamp = 1568735100000
const daysAgo = (days: number) => sept172019Timestamp - days * 24 * 60 * 60 * 1000

describe('groupFeedItemsInSections', () => {
  // Lock the time on Sept 17 2019.
  let dateNowSpy: any
  beforeAll(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => sept172019Timestamp)
    // set the offset to ALWAYS be Pacific for these tests regardless of where they are run
    // see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
    jest.spyOn(Date.prototype, 'getTimezoneOffset').mockImplementation(() => 420)
  })
  afterAll(() => {
    dateNowSpy.mockRestore()
  })

  it('groups into sections correctly', () => {
    const standbyTransactions = [
      // most recent tx, should be first in the list
      mockFeedItem(daysAgo(1), TransactionStatus.Pending),
      // there are more recent completed transactions than this, but it should appear second
      mockFeedItem(daysAgo(6), TransactionStatus.Pending),
    ]
    const feedItems = [
      mockFeedItem(daysAgo(3)),
      mockFeedItem(daysAgo(5)),
      mockFeedItem(daysAgo(15)),
      mockFeedItem(daysAgo(20)),
      mockFeedItem(daysAgo(30)),
      mockFeedItem(daysAgo(30)),
      mockFeedItem(daysAgo(50)),
      mockFeedItem(daysAgo(275)),
      mockFeedItem(daysAgo(400)),
    ]
    const sections = groupFeedItemsInSections(standbyTransactions, feedItems)
    // 8 sections: Pending, Saturday (day 3), Thursday (day 5), September, August, July, December 2018, August 2018
    expect(sections.length).toEqual(8)

    // Pending transactions come first
    expect(sections[0].title).toEqual('feedSectionHeaderPending')
    expect(sections[0].data.length).toEqual(2)
    expect(sections[0].data).toEqual([
      expect.objectContaining({
        status: TransactionStatus.Pending,
      }),
      expect.objectContaining({
        status: TransactionStatus.Pending,
      }),
    ])

    // Day 3 (Saturday - Sept 14, 2019)
    expect(sections[1].title).toEqual('Saturday')
    expect(sections[1].data.length).toEqual(1)

    // Day 5 (Thursday - Sept 12, 2019)
    expect(sections[2].title).toEqual('Thursday')
    expect(sections[2].data.length).toEqual(1)

    // Day 15 (September - beyond 7 days, same month)
    expect(sections[3].title).toEqual('September')
    expect(sections[3].data.length).toEqual(1)

    // Days 20, 30, 30 (August)
    expect(sections[4].title).toEqual('August')
    expect(sections[4].data.length).toEqual(3)

    // Day 50 (July)
    expect(sections[5].title).toEqual('July')
    expect(sections[5].data.length).toEqual(1)

    // Day 275 (December 2018)
    expect(sections[6].title).toEqual('December 2018')
    expect(sections[6].data.length).toEqual(1)

    // Day 400 (August 2018)
    expect(sections[7].title).toEqual('August 2018')
    expect(sections[7].data.length).toEqual(1)
  })
})
