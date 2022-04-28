// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// изменили финальное задание, сделалаи обширным и интересным, задействуем все прошлые проекты
// Связываем их в единую цепь
// Привязка к каждому из ПРОШЛЫХ проектов

// ACDMToken for ACDMPlatform
// XXXToken для листинга на uniswap (LP token)
// Staking депозит LP Токена

// 2 раунда: раунд продажи(SaleRound), раунд торогов
// В SaleRound:
// мы покупаем токены у платформы
// Цена на токен постоянно растет, 1$ => 2$ => 3$
// Количество постоянно уменьшается, зависит от торогов которые проходили в TradeRound
// Если в TradeRound не было совершено ни одного обмена(ни одного свапа между пользователями), то в SaleRound мы не будем продавать вообще ни один ACDM Token
// Самый первый раунд продает токенны на сумму 1ETH (100 000 ACDM)

// В момент старта просчитываем сколько токенов мы будем продавать и у контракта ACDMPlatform есть право mint и burn
// Начали SaleRound(function startSaleRound()) => mint(ACDMPlatform)
// Объём продаж зависит от объём торгов(TradeRound)
// Объём торгов TradeRound = 1 ETH => Объём продаж SaleRound = 1 ETH (100.000 ACDMToken можем продать)
// фиксированная цена по формуле(Price ETH = lastPrice*1,03+0,000004)
// Все что не продали => burn
// После продажи SaleRound можем переключиться на TradeRound
// В TradeRound:
// продаем токены между друг другом
// по фиксированной цене, которую они задают
// Обязательно должно пройти 3 дня

// Реферальная система:
// Система состоит из 2 уровней
// Я -> register(vasyaAddress):
// 1 уровень - Вася
// 2 уровень - Петя
// Вася:
// 1 уровень - Петя

// Я позвал Васю, Вася позвал Петю, и теперь когда Петя делает какие то действия капают проценты мне и Васе с действий Пети
// Нужны ли event от отчислений по рефералу?
//    what's optimal? mint or mint -> transfer -> transfer -> burn

// Crypton Academy => Crypton Factory
// Переименовать токен
// Documentation
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

interface IERC20Mintable is IERC20 {
    function mint(address _account, uint256 _amount) external returns (bool);
    function burn(address _account, uint256 _amount) external returns (bool);
}

contract ACDMPlatform {
    using SafeERC20 for IERC20Mintable;
    using Counters for Counters.Counter;

    IERC20Mintable public ACDMToken;
    Counters.Counter private _orderCounter;

    uint256 public roundTime;
    uint256 public amountTokensForSale;
    uint256 public ethPerTokens = 10_000 gwei;
    uint256 public totalTradingSum = 1 ether;

    /// When the value equals 1, trade round cannot be started
    /// This ensures that the sales round will be the first
    uint256 public saleRoundFinishAt = 1;
    uint256 public tradeRoundFinishAt;

    uint16 public rewardFirstReferralLevel = 50;
    uint16 public rewardSecondReferralLevel = 30;
    uint16 public rewardReferralsRedeemOrder = 25;

    struct Order {
        address seller;
        uint256 price;
        uint256 amount;
    }

    mapping(address => address) public _firstReferralLevel;
    mapping(address => address) public _secondReferralLevel;
    mapping(uint256 => Order) public _orders;

    event NewOrder(uint256 orderId, address indexed seller, uint256 amount, uint256 pricePerToken);

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
    }

    /**
    * @dev Sales Round starts for the first time.
    * It ends after the time of the round or the purchase of all tokens.
    * Can be called by any user.
    */
    function startSaleRound() external {
        require(saleRoundFinishAt <= 1, "Sales round is already active");
        require(block.timestamp > tradeRoundFinishAt, "Trade round is active");

        amountTokensForSale = totalTradingSum / ethPerTokens;
        saleRoundFinishAt = block.timestamp + roundTime;
        delete tradeRoundFinishAt;
    }

    /**
    * @dev Purchase ACDMTokens during Sales Round.
    * The amount of tokens depends on the amount of ETH.
    */
    function buyACDM() external payable {
        require(msg.value > 0, "Value should be positive");
        require(saleRoundFinishAt > block.timestamp, "Sales round is not active");
        uint256 buyerValue = msg.value;
        uint256 amountTokens = buyerValue / ethPerTokens;

        if (amountTokens > amountTokensForSale) {
            uint256 pricePerAvailableTokens = amountTokensForSale * ethPerTokens;
            uint256 excessValue = buyerValue - pricePerAvailableTokens;

            buyerValue -= excessValue;
            amountTokens = amountTokensForSale;

            payable(msg.sender).transfer(excessValue);
        }

        address firstLevel = _firstReferralLevel[msg.sender];
        if (firstLevel != address(0)) {
            uint256 referralValue = buyerValue * rewardFirstReferralLevel / 1000;
            payable(firstLevel).transfer(referralValue);

            address secondLevel = _secondReferralLevel[msg.sender];
            if(secondLevel != address(0)) {
                referralValue = buyerValue * rewardSecondReferralLevel / 1000;
                payable(secondLevel).transfer(referralValue);
            }
        }

        amountTokensForSale -= amountTokens;
        if (amountTokensForSale == 0) delete saleRoundFinishAt;

        ACDMToken.mint(msg.sender, amountTokens);
    }

    /**
    * @dev Trade Round can be started after the roundTime or after the buyback of all tokens.
    * It becomes available to add, redeem and delete orders.
    * Can be called by any user.
    */
    function startTradeRound() external {
        require(saleRoundFinishAt != 1, "Sales round never started");
        require(saleRoundFinishAt < block.timestamp, "Sales round is active");

        tradeRoundFinishAt = block.timestamp + roundTime;
        ethPerTokens = ethPerTokens * 103 / 100 + 4000000000000;

        delete totalTradingSum;
        delete saleRoundFinishAt;
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
        require(ACDMToken.balanceOf(msg.sender) >= _amount, "Not enough tokens");

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
        require(order.amount != 0, "Empty order");

        uint256 availableTokens = msg.value / order.price;
        if (availableTokens > order.amount) availableTokens = order.amount;

        uint256 totalPrice = availableTokens * order.price;
        uint256 excessValue = msg.value - totalPrice;
        if (excessValue > 0) payable(msg.sender).transfer(excessValue);

        _orders[_orderId].amount -= availableTokens;
        totalTradingSum += totalPrice;
        if(_firstReferralLevel[order.seller] != address(0)) {
            uint256 referralValue = totalPrice * rewardReferralsRedeemOrder / 1000;
            payable(_firstReferralLevel[order.seller]).transfer(referralValue);
            if(_secondReferralLevel[order.seller] != address(0)) {
                totalPrice -= referralValue;
                payable(_secondReferralLevel[order.seller]).transfer(referralValue);
            }
            totalPrice -= referralValue;
        }

        payable(order.seller).transfer(totalPrice);
        ACDMToken.safeTransfer(msg.sender, availableTokens);
    }

    function removeOrder(uint256 _orderId) external onlyTradeRound {
        Order storage order = _orders[_orderId];
        require(order.seller == msg.sender, "You are not an owner");

        ACDMToken.safeTransfer(msg.sender, order.amount);
        delete order.amount;
    }

//    config?
//    onlyDao
    function setRewardFirstReferralLevel(uint16 _percent) external {
        require(_percent + rewardSecondReferralLevel <= 1000, "Incorrect percent");
        rewardFirstReferralLevel = _percent;
    }

    function setRewardSecondReferralLevel(uint16 _percent) external {
        require(_percent + rewardFirstReferralLevel <= 1000, "Incorrect percent");
        rewardSecondReferralLevel = _percent;
    }

    function setRewardReferralsRedeemOrder(uint16 _percent) external {
        require(_percent <= 500, "Incorrect percent");
        rewardReferralsRedeemOrder = _percent;
    }

}
