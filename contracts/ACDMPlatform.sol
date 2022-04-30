// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./IERC20Mintable.sol";

contract ACDMPlatform is Ownable {
    using SafeERC20 for IERC20Mintable;
    using Counters for Counters.Counter;

    IERC20Mintable public ACDMToken;
    Counters.Counter private _orderCounter;

    uint256 public roundTime;
    uint256 public amountTokensForSale;
    uint256 public ethPerToken = 10_000 gwei;
    uint256 public totalTradingSum = 1 ether;

    /// When the value equals 1, trade round cannot be started
    /// This ensures that the sales round will be the first
    uint256 public saleRoundFinishAt = 1;
    uint256 public tradeRoundFinishAt;

    // First level - 5%, Second Level - 3%
    uint32 private _referralConfig = 3276830;
    uint16 public rewardReferralsRedeemOrder = 25;

    struct Order {
        address seller;
        uint256 price;
        uint256 amount;
    }

    mapping(address => address) public _firstReferralLevel;
    mapping(address => address) public _secondReferralLevel;
    mapping(uint256 => Order) public _orders;

    event NewOrder(uint256 indexed orderId, address indexed seller, uint256 amount, uint256 pricePerToken);
    event RedeemOrder(address indexed buyer, address indexed seller, uint256 amount);
    event RemoveOrder(uint256 indexed orderId);
    event Register(address indexed user, address indexed referrer);
    event StartSaleRound(uint256 amountTokensForSale, uint256 ethPerToken, uint256 saleRoundFinishAt);
    event StartTradeRound(uint256 tradeRoundFinishAt);
    event BuyACDM(address indexed buyer, uint256 amountTokens);


    modifier onlyTradeRound {
        require(tradeRoundFinishAt > block.timestamp, "Trade round is not active");
        _;
    }

     constructor(address _ACDMToken, uint256 _roundTime) {
         ACDMToken = IERC20Mintable(_ACDMToken);
         roundTime = _roundTime;
     }
    /**
    * @dev Unnecessary function to use the platform.
    * @param _referrer Referral's address
    */
    function register(address _referrer) external {
        require(_firstReferralLevel[msg.sender] == address(0), "You are already registered");
        _firstReferralLevel[msg.sender] = _referrer;

        address referrerFirstLevel = _firstReferralLevel[_referrer];
        if (referrerFirstLevel != address(0))
            _secondReferralLevel[msg.sender] = referrerFirstLevel;

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

        uint256 ethPerToken_ = ethPerToken;
        uint256 _saleRoundFinishAt = block.timestamp + roundTime;
        uint256 _amountTokensForSale = totalTradingSum / ethPerToken_;
        amountTokensForSale = _amountTokensForSale;
        saleRoundFinishAt = _saleRoundFinishAt;

        delete tradeRoundFinishAt;

        emit StartSaleRound(_amountTokensForSale, ethPerToken_, _saleRoundFinishAt);
    }

    /**
    * @dev Purchase ACDMTokens during Sales Round.
    * The amount of tokens depends on the amount of ETH.
    */
    function buyACDM() external payable {
        require(msg.value > 0, "Value should be positive");
        require(saleRoundFinishAt > block.timestamp, "Sales round is not active");

        uint256 buyerValue = msg.value;
        uint256 ethPerToken_ = ethPerToken;
        uint256 amountTokens = buyerValue / ethPerToken_;
        require(amountTokens > 0, "Not enough ETH");

        uint256 amountTokensForSale_ = amountTokensForSale;
        if (amountTokens > amountTokensForSale_) amountTokens = amountTokensForSale_;
        uint256 pricePerOrderTokens = amountTokens * ethPerToken_;

        if (buyerValue > pricePerOrderTokens) {
            uint256 excessValue = buyerValue - pricePerOrderTokens;

            buyerValue -= excessValue;

            payable(msg.sender).transfer(excessValue);
        }

        address firstLevel = _firstReferralLevel[msg.sender];
        if (firstLevel != address(0)) {
            uint32 referralConfig_ = _referralConfig;
            uint256 referralValue = buyerValue * (referralConfig_ >> 16) / 1000;
            payable(firstLevel).transfer(referralValue);

            address secondLevel = _secondReferralLevel[msg.sender];
            if(secondLevel != address(0)) {
                referralValue = buyerValue * (referralConfig_ & uint32(type(uint16).max)) / 1000;
                payable(secondLevel).transfer(referralValue);
            }
        }

        amountTokensForSale_ -= amountTokens;
        amountTokensForSale = amountTokensForSale_;
        if (amountTokensForSale_ == 0) delete saleRoundFinishAt;

        ACDMToken.mint(msg.sender, amountTokens);
        emit BuyACDM(msg.sender, amountTokens);
    }

    /**
    * @dev Trade Round can be started after the roundTime or after the buyback of all tokens.
    * It becomes available to add, redeem and delete orders.
    * Can be called by any user.
    */
    function startTradeRound() external {
        uint256 _saleRoundFinishAt = saleRoundFinishAt;
        require(_saleRoundFinishAt != 1, "Sales round never started");
        require(tradeRoundFinishAt == 0, "Trade round is already active");
        require(_saleRoundFinishAt < block.timestamp, "Sales round is active");

        uint256 _tradeRoundFinishAt = block.timestamp + roundTime;
        tradeRoundFinishAt = _tradeRoundFinishAt;
        ethPerToken = ethPerToken * 103 / 100 + 4000000000000;

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
        require(_amount > 0, "Amount should be positive");
        require(_pricePerToken > 0, "Price should be positive");

        _orderCounter.increment();

        uint256 orderId = _orderCounter.current();
        _orders[orderId].price = _pricePerToken;
        _orders[orderId].amount = _amount;
        _orders[orderId].seller = msg.sender;

        ACDMToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit NewOrder(orderId, msg.sender, _amount, _pricePerToken);
    }

    /**
    * @dev The order may not be fully redeemed.
    * Available during the Trade Round.
    * @param _orderId Order ID
    */
    function redeemOrder(uint256 _orderId) external onlyTradeRound payable {
        require(msg.value > 0, "Value should be positive");
        Order memory order = _orders[_orderId];
        require(order.amount > 0, "Empty order");

        uint256 amountTokens = msg.value / order.price;
        require(amountTokens > 0, "Not enough ETH");
        if (amountTokens > order.amount) amountTokens = order.amount;

        uint256 totalPrice = amountTokens * order.price;
        uint256 excessValue = msg.value - totalPrice;
        if (excessValue != 0) payable(msg.sender).transfer(excessValue);

        _orders[_orderId].amount = order.amount - amountTokens;
        totalTradingSum = totalTradingSum + totalPrice;

        // Transfer to referrals even if reward equals 0
        address firstLevel = _firstReferralLevel[order.seller];
        if(firstLevel != address(0)) {
            uint256 referralValue = totalPrice * rewardReferralsRedeemOrder / 1000;
            totalPrice -= referralValue;
            payable(firstLevel).transfer(referralValue);

            address secondLevel = _secondReferralLevel[order.seller];
            if(secondLevel != address(0)) {
                totalPrice -= referralValue;
                payable(secondLevel).transfer(referralValue);
            }
        }

        payable(order.seller).transfer(totalPrice); // Transfer even 0 ETH
        ACDMToken.safeTransfer(msg.sender, amountTokens);
        emit RedeemOrder(msg.sender, order.seller, amountTokens);
    }

    /**
    * @dev Remove order.
    * Available during the Trade Round.
    * @param _orderId Order ID
    */
    function removeOrder(uint256 _orderId) external onlyTradeRound {
        Order storage order = _orders[_orderId];
        require(order.seller == msg.sender, "You are not an owner");

        ACDMToken.safeTransfer(msg.sender, order.amount);
        delete order.amount;
        emit RemoveOrder(_orderId);
    }

    /**
    * @dev Get a percentage of reward
    * @return firstLevel First referral level percent
    * @return secondLevel Second referral level percent
    */
    function getReferralRewardBuyACDM() public view returns(uint32 firstLevel, uint32 secondLevel) {
        uint32 config = _referralConfig;
        firstLevel = config >> 16;
        secondLevel = config & uint32(type(uint16).max);
    }

    /**
    * @dev Set percentage of reward to first and second levels.
    * It is not provided that the percentage is 0
    * Can by called by the owner
    * @param _firstLevel First level percent
    * @param _secondLevel Second level percent
    */
    function setReferralRewardBuyACDM(uint16 _firstLevel, uint16 _secondLevel) external onlyOwner {
        require(_firstLevel + _secondLevel < 1001, "Incorrect percent");
        _referralConfig = (_firstLevel << 16) + _secondLevel;
    }

    /**
    * @dev Set percentage of reward to redeemOrder function.
    * It is not provided that the percentage is 0
    * Can by called by the owner
    * @param _percent Percent to first, second levels
    */
    function setReferralRewardRedeemOrder(uint16 _percent) external onlyOwner {
        require(_percent < 501, "Incorrect percent");
        rewardReferralsRedeemOrder = _percent;
    }
}