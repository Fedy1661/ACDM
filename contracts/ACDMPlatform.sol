// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IERC20Mintable.sol";

contract ACDMPlatform {
    using SafeERC20 for IERC20Mintable;

    IERC20Mintable public immutable ACDMToken;
    address public immutable DAO;
    uint256 private _orderCounter; /// ID for a new order

    /// The time after which you can complete the round
    uint256 public roundTime; /// Has setter setRoundTime()
    uint256 public amountTokensForSale; /// Amount tokens that can be sold in the sales round
    uint256 public ethPerToken = 10_000 gwei; /// Price per token in the sales round
    uint256 public totalTradingSum = 1 ether; /// Amount received in the trade round

    /// When the value equals 1, trade round cannot be started
    /// This ensures that the sales round will be the first
    uint256 public saleRoundFinishAt = 1; /// Timestamp when the sales round will be finished
    uint256 public tradeRoundFinishAt; /// Timestamp when the trade round will be finished

    /// First level - 5%, Second Level - 3%
    uint256 private _referralConfig = 17014118346046923173168730371588410572830; /// Contains 50 30
    uint256 public rewardReferralsRedeemOrder = 25; /// Percentage that referrals will receive in the redeem order function

    struct Order {
        address seller; /// Seller's address
        uint256 price; /// Price per token
        uint256 amount; /// Amount tokens
    }

    mapping(address => address) private _referrals; /// referral => referrer
    mapping(uint256 => Order) private _orders; /// Contains orders. orderID => Order

    event NewOrder(uint256 indexed orderId, address indexed seller, uint256 amount, uint256 pricePerToken);
    event RedeemOrder(address indexed buyer, address indexed seller, uint256 amount);
    event RemoveOrder(address indexed seller, uint256 indexed orderId);
    event Register(address user, address indexed referrer);
    event BuyACDM(address indexed buyer, uint256 amountTokens);
    event StartSaleRound(uint256 amountTokensForSale, uint256 ethPerToken, uint256 saleRoundFinishAt);
    event StartTradeRound(uint256 tradeRoundFinishAt);

    event ChangeRoundTime(uint256 roundTime);
    event ChangeReferralRewardBuyACDM(uint256 firstLevel, uint256 secondLevel);
    event ChangeReferralRewardRedeemOrder(uint256 percent);

    /**
    * @dev Checking for the activity of the trading round
    */
    modifier onlyTradeRound {
        require(tradeRoundFinishAt > block.timestamp, "Trade round is not active");
        _;
    }

    /**
     * @dev is DAO?
     */
    modifier onlyDAO {
        require(msg.sender == DAO, "Only DAO");
        _;
    }

    /**
    * @param _ACDMToken Address ACDMToken
    * @param _roundTime Round time
    */
     constructor(address _ACDMToken, uint256 _roundTime, address _DAO) {
         ACDMToken = IERC20Mintable(_ACDMToken);
         roundTime = _roundTime;
         DAO = _DAO;
     }

    /**
    * @dev Unnecessary function to use the platform.
    * @param _referrer Referral's address
    */
    function register(address _referrer) external {
        /// Revert if the user has a referrer
        require(_referrals[msg.sender] == address(0), "You are already registered");
        _referrals[msg.sender] = _referrer; /// Assign a referrer to a registered user

        emit Register(msg.sender, _referrer);
    }

    /**
    * @dev Sales Round starts for the first time.
    * It ends after the time of the round or the purchase of all tokens.
    * Can be called by any user.
    */
    function startSaleRound() external {
        require(saleRoundFinishAt < 2, "Sales round is already active");
        require(block.timestamp > tradeRoundFinishAt, "Trade round is active");

        uint256 ethPerToken_ = ethPerToken; /// ethPerToken from storage to memory, to save gas
        uint256 _saleRoundFinishAt = block.timestamp + roundTime; /// Counting round's end
        uint256 _amountTokensForSale = totalTradingSum / ethPerToken_; /// Amount tokens for Sale Round

        amountTokensForSale = _amountTokensForSale; /// To storage
        saleRoundFinishAt = _saleRoundFinishAt; /// To storage

        delete tradeRoundFinishAt; /// Reset Trade round time

        emit StartSaleRound(_amountTokensForSale, ethPerToken_, _saleRoundFinishAt);
    }

    /**
    * @dev Purchase ACDMTokens during Sales Round.
    * The amount of tokens depends on the amount of ETH.
    */
    function buyACDM() external payable {
        /// Using msg.value cheaper than buyerValue

        require(msg.value > 0, "Value should be positive"); /// Revert if user did not specify value
        require(saleRoundFinishAt > block.timestamp, "Sales round is not active"); /// Revert if Sales round is not active

        uint256 buyerValue = msg.value; /// Sum that is distributed between platform and referrers
        uint256 ethPerToken_ = ethPerToken; /// ethPerToken from storage to memory
        uint256 amountTokens = msg.value / ethPerToken_; /// Amount tokens that a user can buy
        require(amountTokens > 0, "Not enough ETH"); /// Revert if user can buy nothing

        uint256 amountTokensForSale_ = amountTokensForSale; /// from storage to memory
        /// if amount available tokens more than amountTokensForSale, then assign leftover tokens to amountTokens
        if (amountTokens > amountTokensForSale_) amountTokens = amountTokensForSale_;
        uint256 pricePerOrderTokens = amountTokens * ethPerToken_; /// Price per available amount tokens

        /// If msg.value more than price per available tokens, then transfer excess value back
        if (msg.value > pricePerOrderTokens) {
            uint256 excessValue = buyerValue - pricePerOrderTokens; /// Counting excess value
            buyerValue -= excessValue; /// Subtraction of excess cost from the distributed
            payable(msg.sender).transfer(excessValue); /// Transfer excess value back
        }

        /// If user has a referrer than transfer reward (1 level)
        address referrer = _referrals[msg.sender];
        if (referrer != address(0)) {
            uint256 referralConfig_ = _referralConfig;
            uint256 referralValue = buyerValue * (referralConfig_ >> 128) / 1000;
            payable(referrer).transfer(referralValue); /// Transfer

            /// If user's referrer has a referrer then transfer reward (2 level)
            referrer = _referrals[referrer];
            if(referrer != address(0)) {
                referralValue = buyerValue * (referralConfig_ & uint256(type(uint128).max)) / 1000;
                payable(referrer).transfer(referralValue); /// Transfer
            }
        }

        amountTokensForSale_ -= amountTokens; /// Subtraction of paid tokens from the total amount
        amountTokensForSale = amountTokensForSale_; /// from memory to storage
        /// If total amount tokens is over, then finish the sales round
        if (amountTokensForSale_ == 0) delete saleRoundFinishAt;

        ACDMToken.mint(msg.sender, amountTokens); /// Mint tokens to buyer
        emit BuyACDM(msg.sender, amountTokens);
    }

    /**
    * @dev Trade Round can be started after the roundTime or after the buyback of all tokens.
    * It becomes available to add, redeem and delete orders.
    * Can be called by any user.
    */
    function startTradeRound() external {
        uint256 _saleRoundFinishAt = saleRoundFinishAt; /// Duplicate
        require(_saleRoundFinishAt != 1, "Sales round never started"); /// Revert if sales round never started
        require(tradeRoundFinishAt == 0, "Trade round is already active"); /// Revert if trade round is active
        require(_saleRoundFinishAt < block.timestamp, "Sales round is active"); /// Revert if sales round is active

        uint256 _tradeRoundFinishAt = block.timestamp + roundTime; /// Counting round's end
        tradeRoundFinishAt = _tradeRoundFinishAt;
        /// Counting price for next sales round
        ethPerToken = (ethPerToken * 103 / 100 + 4050000000000) / 100000000000 * 100000000000;

        /// Reset total trading sum and finish timestamp for sales round
        delete totalTradingSum;
        delete saleRoundFinishAt;

        emit StartTradeRound(_tradeRoundFinishAt);
    }

    /**
    * @dev Order stays until it is redeemed or deleted.
    * Available during the Trade Round.
    * @param _amount Amount tokens
    * @param _pricePerToken Price per token
    */
    function addOrder(uint256 _amount, uint256 _pricePerToken) external onlyTradeRound {
        /// Revert if amount or price per token are empty
        require(_amount > 0, "Amount should be positive");
        require(_pricePerToken > 0, "Price should be positive");

        uint256 orderId = ++_orderCounter; /// Increment Order ID
        Order storage order = _orders[orderId];
        order.seller = msg.sender;
        order.price = _pricePerToken;
        order.amount = _amount;

        ACDMToken.safeTransferFrom(msg.sender, address(this), _amount); /// Take tokens from the user for safekeeping
        emit NewOrder(orderId, msg.sender, _amount, _pricePerToken);
    }

    /**
    * @dev The order may not be fully redeemed.
    * Available during the Trade Round.
    * @param _orderId Order ID
    */
    function redeemOrder(uint256 _orderId) external onlyTradeRound payable {
        require(msg.value > 0, "Value should be positive"); /// Revert if user transfer nothing
        Order memory order = _orders[_orderId]; /// Get order to memory data location
        require(order.amount > 0, "Empty order"); /// Revert if order is empty

        uint256 amountTokens = msg.value / order.price; /// Available tokens
        require(amountTokens > 0, "Not enough ETH"); /// Revert if nothing to send
        /// if amount tokens more than tokens in order, then assign leftover to amount tokens
        if (amountTokens > order.amount) amountTokens = order.amount;

        uint256 rewardReferralsRedeemOrder_ = rewardReferralsRedeemOrder;
        uint256 totalPrice = amountTokens * order.price; /// Counting deal price
        uint256 excessValue = msg.value - totalPrice; /// Counting excess value
        /// excess value exists then transfer it back
        if (excessValue != 0) payable(msg.sender).transfer(excessValue);

        /// Subtracting redeemed tokens
        _orders[_orderId].amount = order.amount - amountTokens;
        totalTradingSum = totalTradingSum + totalPrice; /// Summation

        // Transfer to referrals even if reward equals 0
        address referrer = _referrals[msg.sender];
        if(referrer != address(0)) {
            uint256 referralValue = totalPrice * rewardReferralsRedeemOrder_ / 1000;
            payable(referrer).transfer(referralValue);

            referrer = _referrals[referrer];
            if(referrer != address(0)) {
                payable(referrer).transfer(referralValue);
            }
        }
        totalPrice = totalPrice * (1000 - rewardReferralsRedeemOrder_ * 2) / 1000;

        payable(order.seller).transfer(totalPrice); /// Transfer even 0 ETH
        ACDMToken.safeTransfer(msg.sender, amountTokens); /// Transfer tokens
        emit RedeemOrder(msg.sender, order.seller, amountTokens);
    }

    /**
    * @dev Remove order.
    * Available during the Trade Round.
    * @param _orderId Order ID
    */
    function removeOrder(uint256 _orderId) external onlyTradeRound {
        Order storage order = _orders[_orderId];
        uint256 orderAmount = order.amount;

        require(order.seller == msg.sender, "You are not an owner");
        require(orderAmount > 0, "Order is empty");

        ACDMToken.safeTransfer(msg.sender, orderAmount);
        delete order.amount;

        emit RemoveOrder(msg.sender, _orderId);
    }

    /**
    * @dev Get a percentage of reward
    * @return firstLevel First referral level percent
    * @return secondLevel Second referral level percent
    */
    function getReferralRewardBuyACDM() external view returns(uint256 firstLevel, uint256 secondLevel) {
        uint256 config = _referralConfig;
        firstLevel = config >> 128;
        secondLevel = config & uint256(type(uint128).max);
    }

    /**
    * @dev Set percentage of reward to first and second levels.
    * It is not provided that the percentage is 0
    * Can by called by the owner
    * @param _firstLevel First level percent
    * @param _secondLevel Second level percent
    */
    function setReferralRewardBuyACDM(uint256 _firstLevel, uint256 _secondLevel) external onlyDAO {
        require(_firstLevel + _secondLevel < 1001, "Incorrect percent");
        _referralConfig = (_firstLevel << 128) + _secondLevel;
        emit ChangeReferralRewardBuyACDM(_firstLevel, _secondLevel);
    }

    /**
    * @dev Set percentage of reward to redeemOrder function.
    * It is not provided that the percentage is 0
    * Can by called by the owner
    * @param _percent Percent to first, second levels
    */
    function setReferralRewardRedeemOrder(uint256 _percent) external onlyDAO {
        require(_percent < 501, "Incorrect percent");
        rewardReferralsRedeemOrder = _percent;
        emit ChangeReferralRewardRedeemOrder(_percent);
    }

    /**
    * @dev Set round time in seconds
    * Can by called by the owner
    * @param _roundTime Round Time(seconds)
    */
    function setRoundTime(uint256 _roundTime) external onlyDAO {
        roundTime = _roundTime;
        emit ChangeRoundTime(_roundTime);
    }
}